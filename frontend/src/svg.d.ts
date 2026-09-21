// svg.d.ts
declare module "*.svg" {
  import * as React from "react";
  const Component: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;
  export const ReactComponent: typeof Component;
  export default Component;
}
