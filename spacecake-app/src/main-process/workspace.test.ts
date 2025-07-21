import { expect, test, describe } from "vitest";
import { getWorkspaceName } from "@/main-process/workspace";

// getWorkspaceName tests

describe("getWorkspaceName", () => {
  test.each([["", "spacecake"]])(
    'returns "spacecake" for empty string: %s',
    (workspacePath, expected) => {
      expect(getWorkspaceName(workspacePath)).toBe(expected);
    }
  );

  test.each([
    ["/Users/test/project", "darwin", "project"],
    ["/home/user/my-app", "linux", "my-app"],
    ["/var/www/site", "darwin", "site"],
  ])(
    "returns last part of posix path: %s on %s",
    (workspacePath, platform, expected) => {
      expect(getWorkspaceName(workspacePath, platform as NodeJS.Platform)).toBe(
        expected
      );
    }
  );

  test.each([
    ["/Users/test/project/", "darwin", "project"],
    ["/home/user/my-app/", "linux", "my-app"],
  ])(
    "returns last part even with trailing slash (posix): %s on %s",
    (workspacePath, platform, expected) => {
      expect(getWorkspaceName(workspacePath, platform as NodeJS.Platform)).toBe(
        expected
      );
    }
  );

  test.each([
    ["C:\\Users\\test\\project", "win32", "project"],
    ["D:\\Development\\my-app", "win32", "my-app"],
    ["C:\\Program Files\\Application", "win32", "Application"],
  ])(
    "returns last part of windows path: %s",
    (workspacePath, platform, expected) => {
      expect(getWorkspaceName(workspacePath, platform as NodeJS.Platform)).toBe(
        expected
      );
    }
  );

  test.each([
    ["C:\\Users\\test\\project\\", "win32", "project"],
    ["D:\\Development\\my-app\\", "win32", "my-app"],
    ["C:\\Program Files\\Application\\", "win32", "Application"],
  ])(
    "returns last part even with trailing slash (win32): %s",
    (workspacePath, platform, expected) => {
      expect(getWorkspaceName(workspacePath, platform as NodeJS.Platform)).toBe(
        expected
      );
    }
  );
});
