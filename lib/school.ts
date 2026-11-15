export type School = { name: string; slug: string; crest: string; color: string; tagline: string };

export const SCHOOLS: School[] = [
  { name: "Stanford", slug: "stanford", crest: "S", color: "#8C1515", tagline: "Cardinal" },
  { name: "Berkeley", slug: "berkeley", crest: "CAL", color: "#1F4E99", tagline: "Golden Bears" },
  { name: "USF", slug: "usf", crest: "USF", color: "#00543C", tagline: "Dons" },
  { name: "SF State", slug: "sf-state", crest: "SFSU", color: "#463077", tagline: "Gators" },
  { name: "Other", slug: "other", crest: "?", color: "#7B6E69", tagline: "Somewhere else" },
];

export function schoolSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function hashedColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 55%, 38%)`;
}

export function schoolFor(name: string | null | undefined): School {
  const known = SCHOOLS.find((s) => s.name === name);
  if (known) return known;
  const label = name?.trim() || "Your school";
  return {
    name: label,
    slug: schoolSlug(label),
    crest: label.split(/\s+/).map((w) => w.charAt(0).toUpperCase()).join("").slice(0, 4),
    color: hashedColor(label),
    tagline: "Your campus",
  };
}

export function isKnownSchool(name: string | null | undefined): boolean {
  return SCHOOLS.some((s) => s.name === name && s.slug !== "other");
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("hsl(")) return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
  const hex = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return color + hex;
}

export function formatPts(points: number): string {
  return (Math.round(points * 10) / 10).toLocaleString();
}

type RankedCrew = { groupId: string; name: string; school: string; avgPoints: number };

export function crewStanding<T extends RankedCrew>(crews: T[], isMine: (groupId: string) => boolean) {
  const crew = crews.find((c) => isMine(c.groupId));
  if (!crew) return null;
  const rivals = crews.filter((c) => c.school === crew.school);
  const i = rivals.indexOf(crew);
  return { crew, school: crew.school, rank: i + 1, rivals, leader: rivals[0], ahead: rivals[i - 1], behind: rivals[i + 1] };
}
