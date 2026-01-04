interface DownloadResult {
  downloadUrl: string | undefined;
  errorMessage: string | undefined;
}

const platformPatterns: Record<string, string> = {
  "macos-arm64": "arm64.dmg",
  "macos-x64": "x64.dmg",
  "debian-x64": "amd64.deb",
};

async function fetchLatestRelease() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/spacecake-labs/spacecake/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("error fetching latest github release:", error);
    return null;
  }
}

export async function getDownloadUrl(
  platform: "macos-arm64" | "macos-x64" | "debian-x64"
): Promise<DownloadResult> {
  const pattern = platformPatterns[platform];

  // In development, skip the API call to avoid rate limits during refresh
  if (false) {
    return {
      downloadUrl:
        "https://github.com/spacecake-labs/spacecake/releases/latest",
      errorMessage: undefined,
    };
  }

  const releaseData = await fetchLatestRelease();

  if (!releaseData) {
    return {
      downloadUrl: undefined,
      errorMessage: "Failed to fetch latest release information.",
    };
  }

  const asset = releaseData.assets?.find((a: { name: string }) =>
    a.name.includes(pattern)
  );

  if (asset) {
    return {
      downloadUrl: asset.browser_download_url,
      errorMessage: undefined,
    };
  }

  return {
    downloadUrl: undefined,
    errorMessage: `No matching asset found for "${platform}".`,
  };
}
