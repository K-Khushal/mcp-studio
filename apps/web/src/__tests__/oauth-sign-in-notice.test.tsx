import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useStore } from "../store";
import { OAuthSignInNotice } from "../components/auth/oauth-sign-in-notice";

afterEach(() => { cleanup(); useStore.setState({ oauthAuthorizationUrl: null }); });

it.each(["ms-settings:privacy", "http://auth.example.com/authorize"])("never renders an unsafe fallback link for %s", (url) => {
  useStore.setState({ oauthAuthorizationUrl: url });
  render(<OAuthSignInNotice />);
  expect(screen.queryByRole("link")).toBeNull();
});

it("renders the validated HTTPS fallback for popup blockers", () => {
  useStore.setState({ oauthAuthorizationUrl: "https://auth.example.com/authorize" });
  render(<OAuthSignInNotice />);
  expect(screen.getByRole("link").getAttribute("href")).toBe("https://auth.example.com/authorize");
});

it("renders HTTP approval on a localhost subdomain", () => {
  useStore.setState({ oauthAuthorizationUrl: "http://auth.localhost/authorize" });
  render(<OAuthSignInNotice />);
  expect(screen.getByRole("link").getAttribute("href")).toBe("http://auth.localhost/authorize");
});
