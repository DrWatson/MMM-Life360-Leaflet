// Copy the OBJECT below (without "module.exports =") INSIDE the modules: [ ... ]
// array in MagicMirror/config/config.js. The README contains a paste-ready snippet.
// The access token belongs in ~/.config/MMM-Life360Map/credentials.json, NOT here.
module.exports = {
  module: "MMM-Life360Map",
  position: "top_right",
  config: {
    circleId: "PASTE_YOUR_CIRCLE_ID",
    title: "Our circle",
    showFamilyHeading: true, // "FAMILY LOCATIONS"
    showSyncStatus: true, // "Synced just now"; errors still appear when false
    showRefreshFooter: true, // "Refresh every ..." footer
    showMemberCount: true, // "2 of 2 on map"
    showTitle: true, // Your configured title
    showAdminCrowns: true, // Set false to hide admin crowns on all avatars.
    updateInterval: 60000,
    cardsPosition: "below", // "below", "above", "left", or "right"
    maxAvatarsPerCluster: 3, // Up to 3 avatars together; larger groups show a count.
    speedUnits: "mph", // "mph" or "kmh"
    width: "520px",
    mapWidth: "", // e.g. "320px"; empty preserves automatic sizing.
    mapHeight: "350px"
  }
};
