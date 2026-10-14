import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApertureIcon } from "@phosphor-icons/react";
import { writeFile } from "node:fs/promises";
const icon = React.createElement(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    width: 1024,
    height: 1024,
    viewBox: "0 0 1024 1024",
  },
  React.createElement("rect", {
    x: 80,
    y: 80,
    width: 864,
    height: 864,
    rx: 200,
    fill: "#007f57",
  }),
  React.createElement(
    "g",
    { transform: "translate(222 222)" },
    React.createElement(ApertureIcon, {
      size: 580,
      weight: "bold",
      color: "white",
    }),
  ),
);
await writeFile(
  new URL("../public/thoock-icon.svg", import.meta.url),
  renderToStaticMarkup(icon),
);
