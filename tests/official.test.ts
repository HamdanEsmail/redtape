import { describe, expect, it } from "vitest";
import { isGovernmentDomain, sourceLabel } from "../src/core/official";

describe("isGovernmentDomain", () => {
  it.each([
    "licensing.aldren.gov",
    "www.aldren.gov",
    "permits.aldren.gov.uk",
    "gov.uk",
    "www.gov.uk",
    "business.gov.au",
    "service-public.fr",
    "www.service-public.fr",
    "prefecture.gouv.fr",
    "tramites.gob.mx",
    "meti.go.jp",
    "mbie.govt.nz",
    "canada.gc.ca",
    "army.mil",
    "commission.europa.eu",
    "admin.ch",
    "bundesamt.bund.de",
    "rijksoverheid.nl",
    "licensing.aldren.gov.example",
  ])("labels %s a government domain", (host) => {
    expect(isGovernmentDomain(host)).toBe(true);
  });

  it.each([
    "caa.co.uk",
    "licensing.aldren.example",
    "news.example",
    "gov.example.com",
    "notagov.com",
    "gouvernment.fr",
    "europa.com",
  ])("does not label %s a government domain", (host) => {
    expect(isGovernmentDomain(host)).toBe(false);
  });
});

describe("sourceLabel", () => {
  it("names a government domain as one", () => {
    expect(sourceLabel("permits.aldren.gov.uk")).toBe("government domain");
  });

  it("names an official body's own site that is not a government domain without hiding it", () => {
    expect(sourceLabel("caa.co.uk")).toBe("official body's own site, not a government domain");
  });
});
