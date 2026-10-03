/* global moduleDefinition */
const demo = Object.assign({}, moduleDefinition);
demo.identifier = "demo";
demo.config = { ...demo.defaults, circleId: "sample-circle", width: "100%" };
demo.sendSocketNotification = () => {};
demo.file = name => `../${name}`;
demo.start();
document.getElementById("module").append(demo.getDom());
demo.notificationReceived("DOM_OBJECTS_CREATED");
window.demoModule = demo;
document.getElementById("avatar-limit").onchange = event => {
  demo.config.maxAvatarsPerCluster = Number(event.target.value);
  demo.render();
};
document.getElementById("speed-units").onchange = event => {
  demo.config.speedUnits = event.target.value;
  demo.render();
};

document.querySelectorAll("#visibility-controls input").forEach(input => {
  input.onchange = () => {
    demo.config[input.dataset.option] = input.checked;
    demo.render();
  };
});

document.getElementById("cards-position").onchange = event => {
  demo.config.cardsPosition = event.target.value;
  document.querySelector("main").style.width =
    ["left", "right"].includes(event.target.value) ? "820px" : "520px";
  demo.arrangeCards();
};

function sampleMembers() {
  const now = Date.now();
  return [
    { id: "alex", name: "Alex Rivera", avatar: "avatars/alex.svg", latitude: 40.7813, longitude: -73.9735,
      battery: 86, charging: true, updatedAt: now - 45000, place: "Home", locationStatus: "",
      isAdmin: true, movement: "driving", speedMph: 22.5 },
    { id: "sam", name: "Sam Rivera", avatar: "avatars/sam.svg", latitude: 40.7794, longitude: -73.9632,
      battery: 64, charging: false, updatedAt: now - 120000, place: "The Metropolitan Museum", locationStatus: "",
      isAdmin: true, movement: "walking", speedMph: 3 },
    { id: "jordan", name: "Jordan Rivera", avatar: "avatars/jordan.svg", latitude: 40.7794, longitude: -73.9632,
      battery: 18, charging: false, updatedAt: now - 21 * 60000, place: "The Metropolitan Museum", locationStatus: "" },
    { id: "taylor", name: "Taylor Rivera", avatar: "avatars/taylor.svg", latitude: null, longitude: null,
      battery: null, charging: null, updatedAt: null, place: "", locationStatus: "Location sharing off" }
  ];
}
function showSample() {
  demo.socketNotificationReceived("L360_RESULT", {
    identifier: "demo", circleId: "sample-circle", members: sampleMembers(), fetchedAt: Date.now(), error: null
  });
}
document.getElementById("normal").onclick = showSample;
function showTogether(count) {
  demo.socketNotificationReceived("L360_RESULT", {
    identifier: "demo", circleId: "sample-circle", fetchedAt: Date.now(), error: null,
    members: sampleMembers().slice(0, count).map(member => ({ ...member,
      latitude: 40.7794, longitude: -73.9632, place: "The Metropolitan Museum", locationStatus: ""
    }))
  });
}
document.getElementById("together-three").onclick = () => showTogether(3);
document.getElementById("together-four").onclick = () => showTogether(4);
document.getElementById("error").onclick = () => demo.socketNotificationReceived("L360_RESULT", {
  identifier: "demo", circleId: "sample-circle", error: { code: "NETWORK", message: "Could not reach Life360. Check internet access; retrying." }
});
document.getElementById("empty").onclick = () => demo.socketNotificationReceived("L360_RESULT", {
  identifier: "demo", circleId: "sample-circle", fetchedAt: Date.now(), error: null,
  members: sampleMembers().map(member => ({ ...member, latitude: null, longitude: null,
    battery: null, charging: null, updatedAt: null, locationStatus: "Location sharing off" }))
});
showSample();
