import { createIsomorphicFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

export const setEdgeCacheHeader = createIsomorphicFn()
  .client((_value: string) => {})
  .server((value: string) => {
    setResponseHeader("cache-control", value);
  });
