export function liveTarget(value = "https://utilitypot.modepot.io") {
  const u = new URL(value);
  const production = u.origin === "https://utilitypot.modepot.io";
  const local =
    u.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) &&
    /^454[0-9]$/.test(u.port);
  if (
    (!production && !local) ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error(
      "BASE_URL must be production or a loopback origin on ports 4540–4549.",
    );
  return {
    origin: u.origin,
    mode: local
      ? "local UI + real production backend"
      : "production UI + real production backend",
  };
}
