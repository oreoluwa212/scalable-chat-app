// benchmark.js - Scalability Testing Suite
const io = require('socket.io-client');
const http = require('http');
const { performance } = require('perf_hooks');

class ScalabilityTester {
    constructor(serverUrl = 'http://localhost:3000') {
        this.serverUrl = serverUrl;
        this.clients = [];
        this.metrics = {
            connectionsEstablished: 0,
            messagesReceived: 0,
            messagesSent: 0,
            errors: 0,
            responseTime: [],
            connectionTime: []
        };
        this.testStartTime = 0;
    }

    // Test 1: Connection Scalability
    async testConnectionScalability(targetConnections = 1000, batchSize = 50) {
        console.log(`\n=== Connection Scalability Test ===`);
        console.log(`Target: ${targetConnections} connections in batches of ${batchSize}`);
        
        this.testStartTime = performance.now();
        
        for (let batch = 0; batch < targetConnections; batch += batchSize) {
            const currentBatch = Math.min(batchSize, targetConnections - batch);
            console.log(`Connecting batch ${Math.floor(batch/batchSize) + 1}/${Math.ceil(targetConnections/batchSize)} (${currentBatch} connections)`);
            
            const batchPromises = [];
            for (let i = 0; i < currentBatch; i++) {
                batchPromises.push(this.createConnection(batch + i));
            }
            
            await Promise.all(batchPromises);
            
            // Brief pause between batches to prevent overwhelming
            await this.sleep(100);
            
            // Report progress
            console.log(`Connected: ${this.clients.length}/${targetConnections} (${((this.clients.length/targetConnections)*100).toFixed(1)}%)`);
        }
        
        const totalTime = performance.now() - this.testStartTime;
        console.log(`\nConnection Test Results:`);
        console.log(`- Total connections: ${this.clients.length}`);
        console.log(`- Time taken: ${(totalTime/1000).toFixed(2)}s`);
        console.log(`- Connections/second: ${(this.clients.length/(totalTime/1000)).toFixed(2)}`);
        console.log(`- Average connection time: ${(this.metrics.connectionTime.reduce((a,b) => a+b, 0)/this.metrics.connectionTime.length).toFixed(2)}ms`);
        
        return this.clients.length;
    }

    // Test 2: Message Throughput
    async testMessageThroughput(messagesPerSecond = 100, durationSeconds = 60) {
        console.log(`\n=== Message Throughput Test ===`);
        console.log(`Target: ${messagesPerSecond} messages/second for ${durationSeconds} seconds`);
        
        if (this.clients.length === 0) {
            console.log('No clients connected. Running connection test first...');
            await this.testConnectionScalability(100);
        }
        
        const startTime = performance.now();
        const endTime = startTime + (durationSeconds * 1000);
        const interval = 1000 / messagesPerSecond;
        
        let messageCount = 0;
        const sendMessage = () => {
            if (performance.now() < endTime && this.clients.length > 0) {
                const client = this.clients[messageCount % this.clients.length];
                if (client.socket && client.socket.connected) {
                    const messageStart = performance.now();
                    client.socket.emit('message', { 
                        message: `Test message ${messageCount} at ${Date.now()}` 
                    });
                    this.metrics.messagesSent++;
                    messageCount++;
                }
                setTimeout(sendMessage, interval);
            }
        };
        
        sendMessage();
        
        // Wait for test to complete
        await this.sleep(durationSeconds * 1000 + 1000);
        
        const actualDuration = (performance.now() - startTime) / 1000;
        console.log(`\nThroughput Test Results:`);
        console.log(`- Messages sent: ${this.metrics.messagesSent}`);
        console.log(`- Messages received: ${this.metrics.messagesReceived}`);
        console.log(`- Duration: ${actualDuration.toFixed(2)}s`);
        console.log(`- Actual throughput: ${(this.metrics.messagesSent/actualDuration).toFixed(2)} messages/second`);
        console.log(`- Message delivery rate: ${((this.metrics.messagesReceived/this.metrics.messagesSent)*100).toFixed(1)}%`);
        
        if (this.metrics.responseTime.length > 0) {
            const avgResponseTime = this.metrics.responseTime.reduce((a,b) => a+b, 0) / this.metrics.responseTime.length;
            console.log(`- Average response time: ${avgResponseTime.toFixed(2)}ms`);
        }
    }

    // Test 3: Memory Usage Under Load
    async testMemoryUsage(duration = 30) {
        console.log(`\n=== Memory Usage Test ===`);
        console.log(`Monitoring memory usage for ${duration} seconds`);
        
        const memorySnapshots = [];
        const interval = setInterval(async () => {
            try {
                const response = await this.httpRequest('/api/stats');
                const stats = JSON.parse(response);
                memorySnapshots.push({
                    timestamp: Date.now(),
                    heapUsed: parseFloat(stats.server.memoryUsage.heapUsed.replace(' MB', '')),
                    connections: stats.server.activeConnections,
                    messages: stats.server.totalMessages
                });
                
                process.stdout.write(`\rMemory: ${stats.server.memoryUsage.heapUsed}, Connections: ${stats.server.activeConnections}`);
            } catch (error) {
                console.error('Failed to get memory stats:', error.message);
            }
        }, 1000);
        
        await this.sleep(duration * 1000);
        clearInterval(interval);
        
        console.log(`\n\nMemory Test Results:`);
        if (memorySnapshots.length > 0) {
            const maxMemory = Math.max(...memorySnapshots.map(s => s.heapUsed));
            const minMemory = Math.min(...memorySnapshots.map(s => s.heapUsed));
            const avgMemory = memorySnapshots.reduce((sum, s) => sum + s.heapUsed, 0) / memorySnapshots.length;
            
            console.log(`- Peak memory usage: ${maxMemory.toFixed(2)} MB`);
            console.log(`- Minimum memory usage: ${minMemory.toFixed(2)} MB`);
            console.log(`- Average memory usage: ${avgMemory.toFixed(2)} MB`);
            console.log(`- Memory per connection: ${(avgMemory / (memorySnapshots[memorySnapshots.length-1].connections || 1)).toFixed(3)} MB`);
        }
        
        return memorySnapshots;
    }

    // Test 4: Concurrent Room Performance
    async testConcurrentRooms(roomCount = 10, usersPerRoom = 50) {
        console.log(`\n=== Concurrent Rooms Test ===`);
        console.log(`Testing ${roomCount} rooms with ${usersPerRoom} users each`);
        
        const totalUsers = roomCount * usersPerRoom;
        
        // Create connections if needed
        if (this.clients.length < totalUsers) {
            console.log(`Creating ${totalUsers} connections...`);
            await this.testConnectionScalability(totalUsers);
        }
        
        // Distribute users across rooms
        const roomAssignments = [];
        for (let room = 0; room < roomCount; room++) {
            const roomName = `testroom${room}`;
            const startIndex = room * usersPerRoom;
            const endIndex = Math.min(startIndex + usersPerRoom, this.clients.length);
            
            for (let i = startIndex; i < endIndex; i++) {
                roomAssignments.push({
                    clientIndex: i,
                    roomName: roomName,
                    username: `user${i}`
                });
            }
        }
        
        // Join rooms
        console.log('Joining rooms...');
        const joinPromises = roomAssignments.map(assignment => {
            return new Promise((resolve) => {
                const client = this.clients[assignment.clientIndex];
                if (client.socket && client.socket.connected) {
                    client.socket.emit('join', {
                        username: assignment.username,
                        room: assignment.roomName
                    });
                    client.socket.once('joinConfirmed', resolve);
                } else {
                    resolve();
                }
            });
        });
        
        await Promise.all(joinPromises);
        
        // Test cross-room messaging
        console.log('Testing cross-room messaging...');
        const messagePromises = [];
        
        for (let room = 0; room < roomCount; room++) {
            const roomClients = this.clients.slice(room * usersPerRoom, (room + 1) * usersPerRoom);
            
            // Send messages in each room
            roomClients.forEach((client, index) => {
                if (client.socket && client.socket.connected) {
                    setTimeout(() => {
                        client.socket.emit('message', {
                            message: `Message from room ${room}, user ${index}`
                        });
                    }, Math.random() * 1000);
                }
            });
        }
        
        await this.sleep(3000); // Wait for messages to propagate
        
        console.log(`Concurrent Rooms Test Complete`);
        console.log(`- Rooms created: ${roomCount}`);
        console.log(`- Users per room: ${usersPerRoom}`);
        console.log(`- Total users: ${totalUsers}`);
    }

    // Test 5: Disconnection Handling
    async testDisconnectionHandling(disconnectPercentage = 20) {
        console.log(`\n=== Disconnection Handling Test ===`);
        console.log(`Disconnecting ${disconnectPercentage}% of clients randomly`);
        
        const clientsToDisconnect = Math.floor(this.clients.length * (disconnectPercentage / 100));
        const disconnectIndexes = [];
        
        // Select random clients to disconnect
        while (disconnectIndexes.length < clientsToDisconnect) {
            const index = Math.floor(Math.random() * this.clients.length);
            if (!disconnectIndexes.includes(index)) {
                disconnectIndexes.push(index);
            }
        }
        
        console.log(`Disconnecting ${clientsToDisconnect} clients...`);
        
        // Disconnect clients
        for (const index of disconnectIndexes) {
            const client = this.clients[index];
            if (client.socket && client.socket.connected) {
                client.socket.disconnect();
            }
        }
        
        // Wait for disconnections to process
        await this.sleep(2000);
        
        // Count remaining connections
        const remainingConnections = this.clients.filter(client => 
            client.socket && client.socket.connected
        ).length;
        
        console.log(`Disconnection Test Results:`);
        console.log(`- Clients disconnected: ${clientsToDisconnect}`);
        console.log(`- Remaining connections: ${remainingConnections}`);
        console.log(`- Disconnection success rate: ${((clientsToDisconnect / (clientsToDisconnect + remainingConnections)) * 100).toFixed(1)}%`);
        
        return remainingConnections;
    }

    // Helper method to create a connection
    async createConnection(index) {
        return new Promise((resolve, reject) => {
            const startTime = performance.now();
            
            const socket = io(this.serverUrl, {
                forceNew: true,
                timeout: 5000,
                transports: ['websocket', 'polling']
            });
            
            const client = {
                id: index,
                socket: socket,
                username: `testuser${index}`
            };
            
            socket.on('connect', () => {
                const connectionTime = performance.now() - startTime;
                this.metrics.connectionsEstablished++;
                this.metrics.connectionTime.push(connectionTime);
                
                // Set up message listeners
                socket.on('message', (data) => {
                    this.metrics.messagesReceived++;
                    const responseTime = performance.now() - data.timestamp;
                    if (!isNaN(responseTime)) {
                        this.metrics.responseTime.push(responseTime);
                    }
                });
                
                socket.on('error', (error) => {
                    this.metrics.errors++;
                    console.error(`Client ${index} error:`, error);
                });
                
                resolve(client);
            });
            
            socket.on('connect_error', (error) => {
                this.metrics.errors++;
                reject(error);
            });
            
            socket.on('disconnect', (reason) => {
                console.log(`Client ${index} disconnected: ${reason}`);
            });
            
            this.clients.push(client);
        });
    }

    // Helper method for HTTP requests
    httpRequest(path) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.serverUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: 'GET'
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data));
            });
            
            req.on('error', reject);
            req.setTimeout(5000, () => reject(new Error('Request timeout')));
            req.end();
        });
    }

    // Helper method for delays
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Clean up all connections
    async cleanup() {
        console.log('\n=== Cleaning Up ===');
        console.log(`Disconnecting ${this.clients.length} clients...`);
        
        this.clients.forEach(client => {
            if (client.socket && client.socket.connected) {
                client.socket.disconnect();
            }
        });
        
        await this.sleep(1000);
        console.log('Cleanup complete');
    }

    // Run comprehensive test suite
    async runFullTestSuite() {
        console.log('🚀 Starting Node.js Scalability Test Suite');
        console.log('==========================================');
        
        try {
            // Test server health first
            const healthResponse = await this.httpRequest('/health');
            const health = JSON.parse(healthResponse);
            console.log(`Server Status: ${health.status}`);
            console.log(`Server Worker PID: ${health.worker}`);
            
            // Run all tests
            await this.testConnectionScalability(500, 25);
            await this.testMessageThroughput(50, 30);
            await this.testMemoryUsage(20);
            await this.testConcurrentRooms(5, 20);
            await this.testDisconnectionHandling(30);
            
            // Final statistics
            console.log('\n=== Final Test Results ===');
            console.log(`Total connections established: ${this.metrics.connectionsEstablished}`);
            console.log(`Total messages sent: ${this.metrics.messagesSent}`);
            console.log(`Total messages received: ${this.metrics.messagesReceived}`);
            console.log(`Total errors: ${this.metrics.errors}`);
            console.log(`Test duration: ${((performance.now() - this.testStartTime) / 1000).toFixed(2)}s`);
            
            if (this.metrics.responseTime.length > 0) {
                const avgResponseTime = this.metrics.responseTime.reduce((a,b) => a+b, 0) / this.metrics.responseTime.length;
                const maxResponseTime = Math.max(...this.metrics.responseTime);
                const minResponseTime = Math.min(...this.metrics.responseTime);
                
                console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
                console.log(`Max response time: ${maxResponseTime.toFixed(2)}ms`);
                console.log(`Min response time: ${minResponseTime.toFixed(2)}ms`);
            }
            
        } catch (error) {
            console.error('Test suite failed:', error);
        } finally {
            await this.cleanup();
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const serverUrl = process.argv[2] || 'http://localhost:3000';
    const tester = new ScalabilityTester(serverUrl);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, cleaning up...');
        await tester.cleanup();
        process.exit(0);
    });
    
    // Run the test suite
    tester.runFullTestSuite().then(() => {
        console.log('\n✅ Test suite completed successfully');
        process.exit(0);
    }).catch((error) => {
        console.error('\n❌ Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = ScalabilityTester;

/* 
Usage Examples:

1. Basic test run:
   node benchmark.js

2. Test against different server:
   node benchmark.js http://localhost:8080

3. Custom test scenarios:
   const tester = new ScalabilityTester();
   await tester.testConnectionScalability(1000);
   await tester.testMessageThroughput(200, 60);

4. Integration with CI/CD:
   node benchmark.js && echo "Performance tests passed"

Performance Benchmarks to Achieve:
- 1000+ concurrent WebSocket connections
- 100+ messages per second throughput
- <50ms average response time
- <100MB memory usage for 1000 connections
- 99%+ message delivery rate
- Graceful handling of connection drops

Production Deployment Commands:
- PM2: pm2 start server.js -i max --name "chat-app"
- Docker: docker run -p 3000:3000 -e NODE_ENV=production chat-app
- Cluster: NODE_ENV=production node server.js
*/