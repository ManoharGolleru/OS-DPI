import "@ungap/custom-elements";
import { io } from "socket.io-client";
import { Messages } from "./components/errors";
import { Data } from "./data";
import { State } from "./state";
import "./components";
import { Layout } from "./components/layout";
import { Monitor } from "./components/monitor";
import { ToolBar } from "./components/toolbar";
import db from "./db";
import pleaseWait from "./components/wait";
import "css/designer.css";
import "css/colors.css";
import Globals from "./globals";
import { PatternList } from "./components/access/pattern";
import { MethodChooser } from "./components/access/method";
import { CueList } from "./components/access/cues";
import { Actions } from "./components/actions";
import { callAfterRender, safeRender, postRender } from "./render";
import { Designer } from "components/designer";
import { workerCheckForUpdate } from "components/serviceWorker";
import { accessed } from "./eval";

/** wait for the page to load */
const pageLoaded = new Promise(resolve => {
  window.addEventListener("load", () => {
    document.body.classList.add("loaded");
    resolve(true);
  });
});

export async function start() {
  // 1) Parse sessionId from URL
  const [, , sessionId] = window.location.pathname.split("/");

  // 2) Init Socket.IO
  const socket = io("/", { query: { sessionId } });
  Globals.socket = socket;

  // 3) Handle incoming keyPress events
  socket.on("keyPress", ({ x, y }) => {
    // e.g. update state or highlight button:
    // Globals.state.update({ lastKeyPress: { x, y } });
  });

  // …the rest is your existing logic unchanged…
  let editing = true;
  if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const fetch = params.get("fetch");
    console.log({ fetch });
    if (fetch) {
      await pleaseWait(
        db.readDesignFromURL(fetch, window.location.hash.slice(1))
      );
      editing = params.get("edit") !== null;
      window.history.replaceState(
        {},
        document.title,
        window.location.origin +
          window.location.pathname +
          "#" +
          db.designName
      );
    }
  }
  let name = window.location.hash.slice(1);
  if (!name) {
    name = await db.uniqueName("new");
    window.location.hash = `#${name}`;
  }
  db.setDesignName(name);
  const dataArray = await db.read("content", []);
  const noteArray = await db.read("notes", []);
  await pageLoaded;

  Globals.data = new Data(dataArray);
  Globals.data.setNoteRows(noteArray);
  const layout = await Layout.load(Layout);
  Globals.layout = layout;
  Globals.state = new State(`UIState`);
  Globals.actions = await Actions.load(Actions);
  Globals.cues = await CueList.load(CueList);
  Globals.patterns = await PatternList.load(PatternList);
  Globals.method = await MethodChooser.load(MethodChooser);
  Globals.restart = async () => {
    Globals.method.stop();
    start();
  };
  Globals.error = new Messages();

  function debounce(f) {
    let timeout = null;
    return () => {
      if (timeout) window.cancelAnimationFrame(timeout);
      timeout = window.requestAnimationFrame(f);
    };
  }

  Globals.state.define("editing", editing);
  Globals.designer = Designer.fromObject({
    className: "Designer",
    props: { tabEdge: "top", stateName: "designerTab" },
    children: [
      layout,
      { className: "Content", props: {}, children: [] },
      Globals.actions,
      Globals.cues,
      Globals.patterns,
      Globals.method,
    ],
  });

  const toolbar = ToolBar.create("ToolBar", null);
  toolbar.init();

  const monitor = Monitor.create("Monitor", null);
  monitor.init();

  function renderUI() {
    if (location.host.startsWith("localhost")) {
      const startTime = performance.now();
      const timer = document.getElementById("timer");
      if (timer) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            timer.innerText = `${(performance.now() - startTime).toFixed(0)}ms`;
          });
        });
      }
    }
    const editing = Globals.state.get("editing");
    document.body.classList.toggle("designing", editing);
    safeRender("cues", Globals.cues);
    safeRender("UI", Globals.layout.children[0]);
    if (editing) {
      safeRender("toolbar", toolbar);
      safeRender("tabs", Globals.designer);
      safeRender("monitor", monitor);
      safeRender("errors", Globals.error);
    }
    postRender();
    Globals.method.refresh();
    accessed.clear();
    Globals.state.clearUpdated();
    workerCheckForUpdate();
    document.dispatchEvent(new Event("rendercomplete"));
  }
  Globals.state.observe(debounce(renderUI));
  callAfterRender(() => Globals.designer.restoreFocus());
  renderUI();
}

// existing BroadcastChannel + hashchange + resize logic…
const channel = new BroadcastChannel("os-dpi");
channel.onmessage = event => {
  const message = event.data;
  if (db.designName == message.name) {
    if (message.action == "update") start();
    else if (message.action == "rename" && message.newName)
      window.location.hash = message.newName;
    else if (message.action == "unload") {
      window.close();
      if (!window.closed) window.location.hash = "new";
    }
  }
};
db.addUpdateListener(msg => channel.postMessage(msg));
window.addEventListener("hashchange", () => {
  sessionStorage.clear();
  start();
});
window.addEventListener("resize", () => {
  if (!Globals.state) return;
  Globals.state.update();
});

start();
