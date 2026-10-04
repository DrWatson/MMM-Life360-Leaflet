/* global Module, L */
Module.register("MMM-Life360-Leaflet", {
  requiresVersion: "2.20.0",
  defaults: {
    circleId: "",
    title: "Our circle",
    showFamilyHeading: true,
    showSyncStatus: true,
    showRefreshFooter: true,
    showMemberCount: true,
    showTitle: true,
    showAdminCrowns: true,
    updateInterval: 60000,
    width: "520px",
    mapWidth: "",
    cardBackgroundColor: "#101a17",
    zoomButtonBackgroundColor: "#162322",
    zoomButtonTextColor: "#eaf6ef",
    mapHeight: "350px",
    cardsPosition: "below",
    maxAvatarsPerCluster: 3,
    speedUnits: "mph",
    staleAfter: 15 * 60000,
    maxZoom: 16,
    initialCenter: [20, 0],
    initialZoom: 2,
    autoFit: true,
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },

  getScripts() {
    return [this.file("vendor/leaflet/leaflet.js"),
      this.file("vendor/markercluster/leaflet.markercluster.js")];
  },

  getStyles() {
    return [this.file("vendor/leaflet/leaflet.css"),
      this.file("vendor/markercluster/MarkerCluster.css"),
      this.file("MMM-Life360-Leaflet.css")];
  },

  start() {
    this.members = [];
    this.fetchedAt = null;
    this.error = null;
    this.markers = new Map();
    this.refreshMs = Math.max(5000, Number(this.config.updateInterval) || 60000);
    this.beginPolling();
  },

  beginPolling() {
    clearInterval(this.pollTimer);
    clearInterval(this.ageTimer);
    this.requestMembers();
    this.pollTimer = setInterval(() => this.requestMembers(), this.refreshMs);
    this.ageTimer = setInterval(() => this.render(), 30000);
  },

  requestMembers() {
    this.sendSocketNotification("L360_FETCH", {
      identifier: this.identifier, circleId: this.config.circleId
    });
  },

  suspend() {
    clearInterval(this.pollTimer);
    clearInterval(this.ageTimer);
  },

  resume() {
    this.beginPolling();
    if (this.map) this.map.invalidateSize();
    this.render();
  },

  getDom() {
    // Keep the same map DOM across refreshes to preserve loaded tiles and avoid flashing.
    if (this.root) return this.root;
    this.root = this.el("section", "l360");
    this.root.style.width = this.config.width;
    for (const [option, property] of [
      ["cardBackgroundColor", "--l360-card-background"],
      ["zoomButtonBackgroundColor", "--l360-zoom-background"],
      ["zoomButtonTextColor", "--l360-zoom-text"]
    ]) {
      const value = this.config[option];
      this.root.style.setProperty(property,
        typeof value === "string" && CSS.supports("color", value) ? value : this.defaults[option]);
    }
    this.heading = this.el("div", "l360-heading");
    this.titles = this.el("div");
    this.familyHeading = this.el("div", "l360-eyebrow", "FAMILY LOCATIONS");
    this.titleNode = this.el("h2", "l360-title", this.config.title);
    this.titles.append(this.familyHeading, this.titleNode);
    this.count = this.el("span", "l360-count", "Connecting");
    this.heading.append(this.titles, this.count);
    this.status = this.el("div", "l360-status", "Connecting to Life360…");
    this.status.setAttribute("role", "status");
    this.mapWrap = this.el("div", "l360-map-wrap");
    this.mapNode = this.el("div", "l360-map");
    this.mapNode.style.height = this.config.mapHeight;
    this.mapNode.setAttribute("aria-label", "Circle member locations");
    this.emptyMap = this.el("div", "l360-map-message", "Waiting for locations");
    this.tileWarning = this.el("div", "l360-tile-warning", "Map tiles unavailable; member details still shown below.");
    this.tileWarning.hidden = true;
    this.mapWrap.append(this.mapNode, this.emptyMap, this.tileWarning);
    this.list = this.el("div", "l360-members");
    this.layout = this.el("div", "l360-layout");
    this.footer = this.el("div", "l360-footer");
    this.root.append(this.heading, this.status, this.layout, this.footer);
    this.arrangeCards();
    this.render();
    return this.root;
  },

  arrangeCards() {
    const configured = String(this.config.cardsPosition || "below").trim().toLowerCase();
    const position = ["below", "above", "left", "right"].includes(configured) ? configured : "below";
    this.layout.className = `l360-layout l360-cards-${position}`;
    const mapWidth = String(this.config.mapWidth || "").trim();
    this.layout.style.setProperty("--l360-map-width", mapWidth || "100%");
    this.layout.style.gridTemplateColumns = mapWidth && (position === "left" || position === "right")
      ? (position === "left" ? `minmax(0, 1fr) min(${mapWidth}, 100%)` : `min(${mapWidth}, 100%) minmax(0, 1fr)`)
      : "";
    // Reorder the actual nodes so keyboard navigation follows the visual layout.
    // Moving the existing map node preserves the Leaflet instance and loaded tiles.
    if (position === "above" || position === "left") this.layout.append(this.list, this.mapWrap);
    else this.layout.append(this.mapWrap, this.list);
    if (this.map) {
      this.map.invalidateSize();
      this.geometry = null;
      this.render();
    }
  },

  applyVisibility() {
    this.familyHeading.hidden = !this.config.showFamilyHeading;
    this.titleNode.hidden = !this.config.showTitle;
    this.count.hidden = !this.config.showMemberCount;
    this.titles.hidden = this.familyHeading.hidden && this.titleNode.hidden;
    this.heading.hidden = this.titles.hidden && this.count.hidden;
    // Hiding routine sync text must not conceal an API failure or expired token.
    this.status.hidden = !this.config.showSyncStatus && !this.error;
    this.footer.hidden = !this.config.showRefreshFooter;
  },

  notificationReceived(notification) {
    if (notification === "DOM_OBJECTS_CREATED" || notification === "MODULE_DOM_CREATED" ||
        notification === "DOM_OBJECTS_UPDATED") this.ensureMap();
  },

  ensureMap() {
    if (!this.mapNode?.isConnected || this.map) return;
    if (typeof L === "undefined" || !L.markerClusterGroup) {
      this.status.textContent = "Map library missing. Copy the complete module folder, including vendor/.";
      return;
    }
    this.map = L.map(this.mapNode, {
      zoomControl: false, scrollWheelZoom: false,
      minZoom: 1, maxZoom: 19
    }).setView(this.config.initialCenter, this.config.initialZoom);
    L.control.zoom({ position: "topright" }).addTo(this.map);
    const tiles = L.tileLayer(this.config.tileUrl, {
      attribution: this.config.tileAttribution,
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin"
    }).addTo(this.map);
    tiles.on("tileerror", () => { this.tileWarning.hidden = false; });
    tiles.on("tileload", () => { this.tileWarning.hidden = true; });
    this.clusters = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
      animate: false,
      iconCreateFunction: cluster => this.clusterIcon(cluster)
    }).addTo(this.map);
    this.resizeObserver = new ResizeObserver(() => this.map.invalidateSize());
    this.resizeObserver.observe(this.mapNode);
    this.render();
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "L360_RESULT" || payload.identifier !== this.identifier ||
        payload.circleId !== this.config.circleId) return;
    this.error = payload.error || null;
    if (Array.isArray(payload.members)) {
      this.members = payload.members;
      this.fetchedAt = payload.fetchedAt;
    }
    this.render();
  },

  el(tag, className = "", text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  },

  clusterIcon(cluster) {
    const count = cluster.getChildCount();
    const configured = Number(this.config.maxAvatarsPerCluster);
    const limit = Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 3;
    if (count > limit) {
      return L.divIcon({ html: String(count), className: "l360-cluster", iconSize: [44, 44] });
    }
    const members = cluster.getAllChildMarkers().map(marker => marker.options.life360Member)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const group = this.el("div", "l360-avatar-group");
    const columns = Math.min(3, count);
    group.style.gridTemplateColumns = `repeat(${columns}, 46px)`;
    group.title = members.map(member => member.name).join(", ");
    group.setAttribute("aria-label", `${count} members: ${group.title}`);
    for (const member of members) {
      const face = this.avatar(member, this.isStale(member) ? "l360-pin-stale" : "", true);
      face.title = member.name;
      group.append(face);
    }
    const rows = Math.ceil(count / columns);
    const width = columns * 46 + (columns - 1) * 4;
    const height = rows * 46 + (rows - 1) * 16;
    return L.divIcon({ html: group, className: "l360-cluster-avatars",
      iconSize: [width, height], iconAnchor: [width / 2, height / 2] });
  },

  avatar(member, className = "", showAdmin = true) {
    const wrapper = this.el("span", `l360-avatar ${className}`);
    const face = this.el("span", "l360-avatar-face");
    face.append(this.el("span", "l360-initials", member.name.split(/\s+/).slice(0, 2)
      .map(word => word.charAt(0)).join("")));
    wrapper.append(face);
    let avatarUrl = "";
    try {
      const url = new URL(member.avatar, window.location.href);
      if (member.avatar && (url.protocol === "https:" ||
          (url.protocol === "http:" && url.origin === window.location.origin))) avatarUrl = url.href;
    } catch { /* Keep initials for an invalid image URL. */ }
    if (avatarUrl) {
      const img = this.el("img");
      img.alt = member.name;
      img.referrerPolicy = "no-referrer";
      img.src = avatarUrl;
      img.addEventListener("error", () => img.remove(), { once: true });
      face.append(img);
    }
    if (this.config.showAdminCrowns && showAdmin && member.isAdmin === true) {
      const crown = this.el("span", "l360-admin-crown");
      // Fixed vector artwork: independent of system emoji fonts and remote assets.
      crown.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" aria-hidden="true" focusable="false"><path d="M2 4l5 5 5-7 5 7 5-5-3 11H5z" fill="#ffd45c" stroke="#6e4708" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 15h14v2H5z" fill="#e8a830" stroke="#6e4708" stroke-width="1"/><circle cx="2" cy="3" r="1.7" fill="#ffeaa0"/><circle cx="12" cy="2" r="1.7" fill="#ffeaa0"/><circle cx="22" cy="3" r="1.7" fill="#ffeaa0"/></svg>';
      crown.title = "Circle admin";
      crown.setAttribute("role", "img");
      crown.setAttribute("aria-label", "Circle admin");
      wrapper.append(crown);
    }
    return wrapper;
  },

  age(timestamp) {
    if (!timestamp) return "Time unknown";
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
    return `${Math.floor(minutes / 1440)} days ago`;
  },

  isStale(member) {
    return !member.updatedAt || Date.now() - member.updatedAt > this.config.staleAfter;
  },

  batteryText(member) {
    const level = member.battery === null ? "Battery unknown" : `${member.battery}%`;
    const state = member.charging === true ? "Charging" :
      member.charging === false ? "Not charging" : "Charging unknown";
    return `${level} · ${state}`;
  },

  locationText(member) {
    if (member.locationStatus) return member.locationStatus;
    const place = member.place || "Location shared";
    if (member.movement === "driving") {
      const metric = ["kmh", "km/h", "kph"].includes(String(this.config.speedUnits).toLowerCase());
      const speed = typeof member.speedMph === "number" && Number.isFinite(member.speedMph) && member.speedMph >= 0 ?
        `${Math.round(member.speedMph * (metric ? 1.609344 : 1) * 10) / 10} ${metric ? "km/h" : "mph"}` : "speed unavailable";
      return `${place} · Driving [${speed}]`;
    }
    if (member.movement === "walking") return `${place} · Walking`;
    if (member.movement === "moving") return `${place} · Moving`;
    return place;
  },

  memberCard(member, popup = false) {
    const hasLocation = member.latitude !== null && member.longitude !== null;
    const card = this.el(popup ? "div" : "button", `l360-member${this.isStale(member) ? " l360-stale" : ""}`);
    if (!popup) {
      card.type = "button";
      card.disabled = !hasLocation;
      card.setAttribute("aria-label", `${member.name}, ${this.batteryText(member)}. ${member.locationStatus || "Show on map"}`);
      card.addEventListener("click", () => {
        if (!this.map) return;
        this.map.setView([member.latitude, member.longitude],
          Math.min(this.config.maxZoom, Math.max(this.map.getZoom(), 15)), { animate: false });
        this.focusedMemberId = member.id;
        this.focusPopup = L.popup({ className: "l360-popup", minWidth: 240 })
          .setLatLng([member.latitude, member.longitude])
          .setContent(this.memberCard(member, true)).openOn(this.map);
      });
    }
    const text = this.el("div", "l360-member-text");
    text.append(this.el("div", "l360-name", member.name));
    text.append(this.el("div", "l360-place", this.locationText(member)));
    const battery = this.el("div", `l360-battery${member.charging === true ? " l360-charging" : ""}${member.battery !== null && member.battery <= 20 ? " l360-low" : ""}`);
    const icon = this.el("span", "l360-battery-icon");
    icon.setAttribute("aria-hidden", "true");
    const fill = this.el("span");
    fill.style.width = `${member.battery ?? 0}%`;
    icon.append(fill);
    battery.append(icon, this.el("span", "", this.batteryText(member)));
    text.append(battery);
    const age = this.el("div", "l360-age", hasLocation ?
      `${this.isStale(member) ? "Older report · " : ""}${this.age(member.updatedAt)}` : "No map position");
    if (member.updatedAt) age.title = new Date(member.updatedAt).toLocaleString();
    text.append(age);
    card.append(this.avatar(member), text);
    return card;
  },

  render() {
    if (!this.root) return;
    if (this.heading) this.applyVisibility();
    const located = this.members.filter(m => m.latitude !== null && m.longitude !== null);
    this.count.textContent = this.fetchedAt ? `${located.length} of ${this.members.length} on map` : "Connecting";
    this.status.classList.toggle("l360-error", Boolean(this.error));
    this.status.textContent = this.error ? this.error.message :
      this.fetchedAt ? `Synced ${this.age(this.fetchedAt).toLowerCase()}` : "Connecting to Life360…";
    this.footer.textContent = `Refresh every ${Math.round(this.refreshMs / 1000)}s · Times show last location report`;
    if (this.error && this.fetchedAt) this.footer.textContent =
      `Showing last successful data · Synced ${this.age(this.fetchedAt).toLowerCase()}`;
    this.emptyMap.hidden = located.length > 0;
    this.emptyMap.textContent = this.fetchedAt ? "No shared locations available" : "Waiting for locations";
    this.list.replaceChildren(...this.members.map(member => this.memberCard(member)));
    if (this.fetchedAt && !this.members.length) this.list.append(this.el("div", "l360-empty", "No members returned for this circle."));
    if (!this.map) return;
    const ids = new Set(located.map(m => m.id));
    for (const [id, marker] of this.markers) {
      if (!ids.has(id)) { this.clusters.removeLayer(marker); this.markers.delete(id); }
    }
    for (const member of located) {
      const face = this.avatar(member, this.isStale(member) ? "l360-pin-stale" : "");
      const icon = L.divIcon({ html: face, className: "l360-pin", iconSize: [46, 46], iconAnchor: [23, 23] });
      const iconKey = JSON.stringify([member.name, member.avatar, member.isAdmin, this.isStale(member), this.config.showAdminCrowns]);
      let marker = this.markers.get(member.id);
      if (!marker) {
        marker = L.marker([member.latitude, member.longitude], { icon, title: member.name,
          life360Position: [member.latitude, member.longitude], life360IconKey: iconKey,
          life360Member: member });
        // DOM content (not interpolated HTML) keeps names and API data inert.
        marker.bindTooltip(this.el("span", "", member.name), { direction: "bottom", offset: [0, 23] });
        marker.bindPopup(this.memberCard(member, true), { className: "l360-popup", minWidth: 240 });
        this.markers.set(member.id, marker);
        this.clusters.addLayer(marker);
      } else {
        marker.options.life360Member = member;
        // Spiderfying temporarily changes marker coordinates. Compare server positions
        // separately so refreshing ages doesn't collapse overlapping markers.
        const old = marker.options.life360Position;
        if (old[0] !== member.latitude || old[1] !== member.longitude) {
          this.clusters.removeLayer(marker);
          marker.setLatLng([member.latitude, member.longitude]);
          marker.options.life360Position = [member.latitude, member.longitude];
          this.clusters.addLayer(marker);
        }
        if (marker.options.life360IconKey !== iconKey) {
          marker.options.title = member.name;
          marker.setIcon(icon);
          marker.options.life360IconKey = iconKey;
        }
        marker.setTooltipContent(this.el("span", "", member.name));
        marker.setPopupContent(this.memberCard(member, true));
      }
    }
    // Cluster icons cache their DOM independently of individual marker icons.
    // Re-evaluate the current count and configured threshold on every refresh,
    // even if no member's avatar/admin/stale state changed.
    this.clusters.refreshClusters();
    if (this.focusPopup?.isOpen()) {
      const selected = located.find(member => member.id === this.focusedMemberId);
      if (selected) this.focusPopup.setLatLng([selected.latitude, selected.longitude])
        .setContent(this.memberCard(selected, true));
      else this.map.closePopup(this.focusPopup);
    }
    const geometry = JSON.stringify(located.map(m => [m.id, m.latitude, m.longitude]));
    if (located.length && geometry !== this.geometry && (this.config.autoFit || !this.hasFit)) {
      this.map.invalidateSize();
      this.map.fitBounds(located.map(m => [m.latitude, m.longitude]), {
        padding: [48, 48], maxZoom: this.config.maxZoom, animate: false
      });
      this.hasFit = true;
    }
    this.geometry = geometry;
  }
});
