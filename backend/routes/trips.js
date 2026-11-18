const express = require("express");
const router = express.Router();
const controller = require("../controllers/tripController");

router.get("/", controller.listTrips);
router.get("/:id", controller.getTrip);
router.post("/", controller.createTrip);
router.delete("/:id", controller.deleteTrip);

module.exports = router;