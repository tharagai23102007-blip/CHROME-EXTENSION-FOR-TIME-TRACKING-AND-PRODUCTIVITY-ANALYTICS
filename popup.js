const SESSION_KEY = "__activeSession";
const PRODUCTIVE_DOMAINS = [
    "github.com",
    "stackoverflow.com",
    "developer.mozilla.org",
    "docs.google.com",
    "notion.so",
    "todoist.com",
    "coursera.org",
    "khanacademy.org"
];

function formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) return `${hours}h ${remainingMinutes}m`;
    return `${minutes}m`;
}

function isProductiveSite(hostname) {
    return PRODUCTIVE_DOMAINS.some((domain) =>
        hostname === domain || hostname.endsWith(`.${domain}`)
    );
}

function renderUsage(data) {
    const activeSession = data[SESSION_KEY];
    const usage = Object.entries(data)
        .filter(([key, value]) => key !== SESSION_KEY && typeof value === "number")
        .map(([hostname, milliseconds]) => [hostname, milliseconds]);

    if (activeSession?.site && Number.isFinite(activeSession.startedAt)) {
        const activeSite = usage.find(([hostname]) => hostname === activeSession.site);
        const elapsed = Math.max(0, Date.now() - activeSession.startedAt);
        if (activeSite) activeSite[1] += elapsed;
        else usage.push([activeSession.site, elapsed]);
    }

    usage.sort((first, second) => second[1] - first[1]);

    const totalTime = usage.reduce((total, [, milliseconds]) => total + milliseconds, 0);
    const productiveTime = usage.reduce((total, [hostname, milliseconds]) =>
        total + (isProductiveSite(hostname) ? milliseconds : 0), 0
    );

    document.getElementById("totalTime").textContent = formatDuration(totalTime);
    document.getElementById("score").textContent = totalTime
        ? `${Math.round((productiveTime / totalTime) * 100)}%`
        : "0%";
    document.getElementById("siteCount").textContent = `${usage.length} ${usage.length === 1 ? "SITE" : "SITES"}`;

    const results = document.getElementById("results");
    results.replaceChildren();

    if (usage.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "No activity yet. Start browsing to see your usage.";
        results.append(emptyState);
        return;
    }

    for (const [hostname, milliseconds] of usage) {
        const row = document.createElement("article");
        row.className = "site-row";

        const details = document.createElement("div");
        details.className = "site-details";

        const name = document.createElement("span");
        name.className = "site-name";
        name.textContent = hostname;

        const duration = document.createElement("span");
        duration.className = "site-duration";
        duration.textContent = formatDuration(milliseconds);

        const track = document.createElement("div");
        track.className = "usage-track";

        const bar = document.createElement("span");
        bar.className = "usage-bar";
        bar.style.width = `${Math.max(4, (milliseconds / usage[0][1]) * 100)}%`;

        details.append(name, duration);
        track.append(bar);
        row.append(details, track);
        results.append(row);
    }
}

function refreshUsage() {
    chrome.storage.local.get(null, renderUsage);
}

refreshUsage();
setInterval(refreshUsage, 15000);