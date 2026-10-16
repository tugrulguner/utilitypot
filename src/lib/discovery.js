// Public fixed constants only; never derive destinations from DOM hrefs or input.
const destinations = {
  modepot: "https://modepot.io/",
  creator: "https://tugrul.modepot.io/",
  intpot: "https://intpot.modepot.io/",
  summonpot: "https://summonpot.modepot.io/",
  refpot: "https://refpot.modepot.io/",
};
export function discoveryProperties(destination, surface) {
  if (
    !Object.hasOwn(destinations, destination) ||
    !["intro", "result", "showcase", "header", "footer"].includes(surface)
  )
    return null;
  const properties = {
    destination: destinations[destination],
    surface: `utility_${surface}`,
  };
  if (destination === "modepot")
    return { event: "modepot_clicked", properties };
  if (destination === "creator")
    return { event: "creator_profile_clicked", properties };
  return {
    event: "modepot_project_clicked",
    properties: {
      project: destination,
      ...properties,
      destination_type: "site",
    },
  };
}
export function resultDiscovery(panel) {
  let revision = 0;
  return {
    reset() {
      if (panel) panel.hidden = true;
      return ++revision;
    },
    complete(outcome, eligible, token = revision) {
      if (token !== revision) return;
      if (panel) panel.hidden = outcome !== "success" || !eligible;
    },
  };
}
