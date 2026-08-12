import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-046 application isolation", () => {
  it("keeps Leaflet behind one client-only no-SSR leaf boundary", () => {
    const base = read("components/map/map-base.tsx");
    const implementation = read("components/map/leaflet-map.tsx");
    const layout = read("app/layout.tsx");

    expect(base.startsWith('"use client"')).toBe(true);
    expect(base).toContain('dynamic(() => import("./leaflet-map")');
    expect(base).toContain("ssr: false");
    expect(base).not.toContain("suspense:");
    expect(base).not.toMatch(/from "(?:leaflet|react-leaflet)"/);
    expect(base).not.toContain("onSearchRequested");
    expect(implementation).toContain('from "leaflet"');
    expect(implementation).toContain('from "react-leaflet"');
    expect(layout.match(/leaflet\/dist\/leaflet\.css/g)).toHaveLength(1);
    expect(layout.startsWith('"use client"')).toBe(false);
  });

  it("keeps the shared map generic, explicit-action based, and free of provider or API behavior", () => {
    const mapSources = ["map-base", "leaflet-map", "map-search-control"]
      .map((name) => read(`components/map/${name}.tsx`))
      .join("\n");

    expect(mapSources).toContain("Tìm trong khu vực này");
    expect(read("components/map/leaflet-map.tsx")).toContain("moveend");
    expect(mapSources).not.toMatch(/\bfetch\s*\(|\/api\/|navigator\.geolocation|Nominatim|Cloudinary/i);
    expect(mapSources).not.toMatch(/cluster|drawing|routing|autocomplete|reverseGeocod/i);
  });

  it("pins only the approved Leaflet dependencies and scans shared component sources", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const tailwind = read("tailwind.config.ts");

    expect(packageJson.dependencies.leaflet).toBe("1.9.4");
    expect(packageJson.dependencies["react-leaflet"]).toBe("5.0.0");
    expect(packageJson.devDependencies["@types/leaflet"]).toBe("1.9.22");
    expect(packageJson.scripts["test:rm046"]).toContain("test/rm046-application-isolation.test.ts");
    expect(tailwind).toContain('"./components/**/*.{js,ts,jsx,tsx,mdx}"');
    expect(tailwind).toContain('"./features/**/*.{js,ts,jsx,tsx,mdx}"');
  });

  it("does not implement actor pages or routes from later roadmap tasks", () => {
    ["tenant", "landlord", "admin", "login", "register"].forEach((route) => {
      expect(existsSync(join(frontendRoot, "app", route))).toBe(false);
    });
  });
});
