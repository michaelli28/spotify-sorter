import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // The route badge sits bottom-left, on top of the fixed action bar. Build
  // and runtime errors still surface with it off.
  devIndicators: false,
};

export default nextConfig;
