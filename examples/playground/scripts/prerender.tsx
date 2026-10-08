#!/usr/bin/env bun
/**
 * Prerender the page into the built index.html, after `vite build`: the first paint
 * is real HTML instead of an empty #root waiting on the script. main.tsx then hydrates
 * it rather than rendering from nothing. Runs the same App the browser does; anything
 * that needs a browser (sockets, storage, the keyboard) lives in effects, which a
 * server render never runs.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "../src/App";
import "../src/icons";

const file = `${import.meta.dir}/../dist/client/index.html`;
const EMPTY = '<div id="root"></div>';

const html = await Bun.file(file).text();
if (!html.includes(EMPTY)) throw new Error(`prerender: no empty ${EMPTY} in ${file}`);

const body = renderToString(
  <StrictMode>
    <App />
  </StrictMode>,
);
await Bun.write(file, html.replace(EMPTY, `<div id="root">${body}</div>`));
console.log(
  `prerendered ${(body.length / 1024).toFixed(1)} kB of HTML into dist/client/index.html`,
);
