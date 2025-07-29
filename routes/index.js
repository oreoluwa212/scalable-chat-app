var express = require("express");
var router = express.Router();
const chatController = require("../controllers/chatController");

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Scalable Chat App" });
});

/* GET stats API */
router.get("/api/stats", function (req, res) {
  try {
    const stats = chatController.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;
