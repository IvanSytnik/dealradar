// Marketplace-wide German vocabulary. Applies to every watch, independent of the item.

/** Not an offer: wanted ads, swaps, buy-ups. */
export const NOT_AN_OFFER = [
  "suche",
  "suchen",
  "gesucht",
  "tausche",
  "tausch",
  "kaufe",
  "ankauf",
  "wir kaufen",
  "nur karton",
  "nur ovp",
  "nur verpackung",
  "leerkarton",
  "leerverpackung",
  "leere ovp",
  // services, not items: repair shops and modders flood Kleinanzeigen console searches.
  // "reparatur" alone stays allowed: "PS5 zur Reparatur" is a broken unit, which allowDefect decides.
  "reparaturservice",
  "reparatur service",
  "umbau",
  "reinigung",
  "modifikation",
  "wir reparieren",
  // already gone
  "reserviert",
  "bereits verkauft",
  "schon verkauft",
  "vergeben",
  "sold",
];

/**
 * Accessories common to most electronics searches. Treated like per-watch accessory words:
 * dropped unless the title also has a bundle signal. Skipped automatically when the user's
 * own search contains the word (someone searching "xbox controller" gets controllers).
 */
export const GENERIC_ACCESSORIES = [
  "controller",
  "gamepad",
  "joystick",
  "headset",
  "kopfhoerer",
  "huelle",
  "case",
  "cover",
  "tasche",
  "schutzfolie",
  "folie",
  "panzerglas",
  "skin",
  "netzteil",
  "ladegeraet",
  "ladekabel",
  "ladestation",
  "kabel",
  "adapter",
  "staender",
  "halterung",
  "fernbedienung",
  "ersatzakku",
];

/**
 * Games are bundle-able like accessories, but matched as whole words only:
 * a prefix would also hit "Gaming", "Spielekonsole", "Spielzeug".
 */
export const GAME_WORDS = ["spiel", "spiele", "spielen", "game", "games", "videospiel", "videospiele"];

/** Signals that the title describes the item plus extras, not an accessory alone. */
export const BUNDLE_SIGNALS = [
  "mit",
  "inkl",
  "inklusive",
  "samt",
  "plus",
  "bundle",
  "paket",
  "konsole",
  "console",
  "+",
  "&",
];

/** Broken / for parts. Flagged, dropped only if the watch disallows defects. */
export const DEFECT_WORDS = [
  "defekt",
  "bastler",
  "ersatzteil",
  "ersatzteile",
  "kaputt",
  "ohne funktion",
  "funktioniert nicht",
  "nicht funktionsfaehig",
  "fuer teile",
  "wasserschaden",
  "displaybruch",
];
