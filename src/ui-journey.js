export function journeyMarkup(s) {
  return `<span>COASTAL TRANSPORT / VIPER ONE</span><strong>${s.transit.destination === "ridge" ? "Landing Coast to Lighthouse Ridge" : "Lighthouse Ridge to Landing Coast"}</strong><svg class="journey-map" viewBox="0 0 800 440" role="img" aria-label="Boat travelling between the two islands"><defs><pattern id="journey-water" width="60" height="42" patternUnits="userSpaceOnUse"><path d="M5 20h20m15 13h12" stroke="#98d9d0" stroke-opacity=".25" stroke-width="2"/></pattern></defs><rect width="800" height="440" fill="#164250"/><rect class="journey-waves" x="-60" y="-42" width="920" height="524" fill="url(#journey-water)"/><path d="M0 0H180L205 65 145 120 170 200 110 255 140 330 70 405 0 440Z" fill="#617f65" stroke="#b6b99c" stroke-width="14"/><path d="M800 0H700L690 95 735 150 680 210 655 300 705 375 800 415Z" fill="#5e7c63" stroke="#b6b99c" stroke-width="14"/><g fill="#374f51" stroke="#9bad96" stroke-width="3"><rect x="40" y="110" width="68" height="58"/><rect x="80" y="45" width="50" height="32"/><rect x="720" y="210" width="55" height="48"/><circle cx="733" cy="305" r="23"/></g><g fill="#8d8e6b"><path d="M90 260h75v21H90zM642 220h62v20h-62z"/></g><g font-family="monospace" font-size="13" fill="#e0e9ca"><text x="28" y="365">LANDING COAST</text><text x="610" y="105">LIGHTHOUSE RIDGE</text></g><path d="M150 270Q400 430 650 230" fill="none" stroke="#a0c7b1" stroke-width="2" stroke-dasharray="5 12" opacity=".5"/><g id="journey-boat"><g class="journey-wake" fill="none" stroke="#dbf4e5" stroke-width="3"><path d="M-28 0L-78 -21M-28 0L-78 21"/><path d="M-38 -8L-90 -30M-38 8L-90 30" opacity=".3"/></g><path d="M33 0Q12 -17-27 -12L-34 0-27 12Q12 17 33 0Z" fill="#334b46" stroke="#b5c1a0" stroke-width="3"/><rect x="-15" y="-9" width="27" height="18" rx="5" fill="#111f27"/><path d="M17 -7L25 0 17 7" fill="#819c93"/><circle cx="-5" cy="0" r="5" fill="#91c7bc"/>${s.companions
    .filter((a) => a.hp > 0)
    .map(
      (a, i) =>
        `<circle cx="${-20 - i * 8}" cy="${i ? 5 : -5}" r="4" fill="#8eaca6"/>`,
    )
    .join(
      "",
    )}</g></svg><progress id="journey-progress" max="1" value="0"></progress><small id="journey-status"></small><button id="journey-pause" class="secondary">PAUSE JOURNEY</button>`;
}
export function updateJourney(el, s) {
  el.querySelector(".journey-map").setAttribute(
    "viewBox",
    s.scale.height <= 540 ? "0 180 800 210" : "0 0 800 440",
  );
  el.querySelector(".journey-map text:last-child").setAttribute("y", "210");
  const progress = Math.min(1, s.transit.elapsed / s.transit.duration),
    ease = progress * progress * (3 - 2 * progress),
    u = s.transit.destination === "ridge" ? ease : 1 - ease;
  const x = 150 + 500 * u,
    y = (1 - u) * (1 - u) * 270 + 2 * (1 - u) * u * 430 + u * u * 230;
  const angle =
    (Math.atan2(320 - 720 * u, 500) * 180) / Math.PI +
    (s.transit.destination === "ridge" ? 0 : 180);
  el.querySelector("#journey-boat").setAttribute(
    "transform",
    `translate(${x} ${y}) rotate(${angle})`,
  );
  el.querySelector("#journey-progress").value = progress;
  el.querySelector("#journey-status").textContent =
    `${Math.round(progress * 100)}% / ${1 + s.companions.filter((a) => a.hp > 0).length} aboard / equipment and evidence secured`;
}
