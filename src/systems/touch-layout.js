export const TOUCH_LAYOUT_KEY = "exfil.touch-layout.v1";
export const CONTROL_NAMES = {
  "move-stick": "Movement stick",
  "aim-stick": "Aim / fire stick",
  "touch-interact": "Use / interact",
  "touch-reload": "Reload",
  "touch-transmit": "Transmit",
  "touch-quiet": "Quiet movement",
  "touch-map": "Map",
  "touch-heal": "Medkit",
  "weapon-switch": "Switch weapon",
  "pause-button": "Pause",
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function validateTouchLayout(raw) {
  const result = { version: 1, opacity: 0.85, positions: {} };
  if (!raw || raw.version !== 1) return result;
  if (Number.isFinite(raw.opacity)) result.opacity = clamp(raw.opacity, 0.3, 1);
  for (const id of Object.keys(CONTROL_NAMES)) {
    const item = raw.positions?.[id];
    if (
      item &&
      Number.isFinite(item.x) &&
      Number.isFinite(item.y) &&
      Number.isFinite(item.size)
    )
      result.positions[id] = {
        x: clamp(item.x, 0, 1),
        y: clamp(item.y, 0, 1),
        size: clamp(item.size, 0.75, 1.5),
      };
  }
  return result;
}
function defaults(width, height) {
  const small = height <= 540,
    stick = small ? 88 : 112,
    bottom = small ? 75 : 110,
    action = small ? 44 : 49,
    gap = small ? 8 : 10,
    bw = small ? 47 : 54,
    right = small ? 120 : 153,
    left = small ? 123 : 156;
  return {
    "move-stick": {
      x: small ? 18 : 24,
      y: height - bottom - stick,
      w: stick,
      h: stick,
    },
    "aim-stick": {
      x: width - (small ? 18 : 24) - stick,
      y: height - bottom - stick,
      w: stick,
      h: stick,
    },
    "touch-interact": {
      x: width - right - bw * 2 - gap,
      y: height - (small ? 74 : 112) - action,
      w: bw,
      h: action,
    },
    "touch-reload": {
      x: width - right - bw,
      y: height - (small ? 74 : 112) - action,
      w: bw,
      h: action,
    },
    "touch-transmit": {
      x: width - (small ? 120 : 36) - (small ? 102 : 90),
      y: height - (small ? 129 : 225) - (small ? 44 : 45),
      w: small ? 102 : 90,
      h: small ? 44 : 45,
    },
    "touch-quiet": {
      x: left,
      y: height - (small ? 74 : 112) - action,
      w: bw,
      h: action,
    },
    "touch-map": {
      x: left,
      y: height - (small ? 129 : 174) - action,
      w: bw,
      h: action,
    },
    "touch-heal": {
      x: small ? 181 : 214,
      y: height - (small ? 129 : 174) - action,
      w: bw,
      h: action,
    },
    "weapon-switch": {
      x: width - (small ? 157 : 273),
      y: height - (small ? 70 : 80),
      w: small ? 55 : 85,
      h: 44,
    },
    "pause-button": { x: width - 195, y: 0, w: 78, h: 44 },
  };
}
export function controlRect(id, layout, width, height) {
  const base = defaults(width, height)[id],
    saved = layout.positions[id],
    size = saved?.size || 1;
  const w = Math.min(width - 16, Math.max(44, base.w * size)),
    h = Math.min(height - 16, Math.max(44, base.h * size));
  const cx = saved ? saved.x * width : base.x + base.w / 2,
    cy = saved ? saved.y * height : base.y + base.h / 2;
  return {
    x: clamp(cx - w / 2, 8, width - w - 8),
    y: clamp(cy - h / 2, 8, height - h - 8),
    w,
    h,
  };
}
export class TouchLayout {
  constructor() {
    this.data = validateTouchLayout(null);
    try {
      this.data = validateTouchLayout(
        JSON.parse(localStorage.getItem(TOUCH_LAYOUT_KEY)),
      );
    } catch {
      /* Defaults remain usable if storage is blocked. */
    }
  }
  apply(root) {
    if (!document.body.classList.contains("touch-mode")) return;
    const width = root.clientWidth,
      height = root.clientHeight;
    for (const id of Object.keys(CONTROL_NAMES)) {
      const el = root.querySelector("#" + id);
      if (!el) continue;
      // Unchanged controls retain their CSS safe-area defaults.
      if (!Object.keys(this.data.positions).length) continue;
      const r = controlRect(id, this.data, width, height);
      Object.assign(el.style, {
        position: "absolute",
        left: r.x + "px",
        top: r.y + "px",
        right: "auto",
        bottom: "auto",
        width: r.w + "px",
        height: r.h + "px",
        minWidth: "44px",
        minHeight: "44px",
        margin: "0",
        opacity: String(this.data.opacity),
      });
      root.querySelector(".hud").append(el); // Give every edited control the same viewport origin.
    }
    for (const id of Object.keys(CONTROL_NAMES)) {
      const el = root.querySelector("#" + id);
      if (el) el.style.opacity = String(this.data.opacity);
    }
  }
  open(ui, onClose = () => {}) {
    if (document.getElementById("touch-editor")) return;
    const draft = structuredClone(this.data),
      overlay = document.createElement("section");
    overlay.id = "touch-editor";
    overlay.setAttribute("aria-label", "Customize touch controls");
    overlay.innerHTML = `<div class="editor-grid" aria-hidden="true"></div><div class="editor-instruction">CONTROL LAYOUT / DRAG BUTTONS TO MOVE</div><div class="editor-items"></div><section class="editor-toolbar"><button id="editor-collapse" class="text-button">HIDE OPTIONS</button><div class="editor-options"><label>Selected control<select id="editor-selected">${Object.entries(
      CONTROL_NAMES,
    )
      .map(([id, name]) => `<option value="${id}">${name}</option>`)
      .join(
        "",
      )}</select></label><label>Size <output id="editor-size-value"></output><input type="range" id="editor-size" min="75" max="150" step="5"/></label><label>Opacity <output id="editor-opacity-value"></output><input type="range" id="editor-opacity" min="30" max="100" step="5"/></label><p id="editor-status" role="status">Drag a control with one finger. Positions adapt to your screen.</p><div class="editor-actions"><button id="editor-save">SAVE LAYOUT</button><button id="editor-reset">DEFAULTS</button><button id="editor-cancel">CANCEL</button></div></div></section>`;
    ui.root.append(overlay);
    let selected = "move-stick",
      drag = null;
    const items = overlay.querySelector(".editor-items"),
      select = overlay.querySelector("#editor-selected"),
      size = overlay.querySelector("#editor-size"),
      opacity = overlay.querySelector("#editor-opacity");
    const buttons = new Map();
    const dimensions = () => ({
      w: overlay.clientWidth,
      h: overlay.clientHeight,
    });
    const refresh = () => {
      const { w, h } = dimensions();
      for (const [id, el] of buttons) {
        const r = controlRect(id, draft, w, h);
        Object.assign(el.style, {
          left: r.x + "px",
          top: r.y + "px",
          width: r.w + "px",
          height: r.h + "px",
          opacity: String(draft.opacity),
        });
        el.classList.toggle("selected", id === selected);
      }
      select.value = selected;
      size.value = Math.round((draft.positions[selected]?.size || 1) * 100);
      opacity.value = Math.round(draft.opacity * 100);
      overlay.querySelector("#editor-size-value").textContent =
        size.value + "%";
      overlay.querySelector("#editor-opacity-value").textContent =
        opacity.value + "%";
    };
    for (const [id, name] of Object.entries(CONTROL_NAMES)) {
      const el = document.createElement("button");
      el.className =
        "editor-control" + (id.includes("stick") ? " editor-stick" : "");
      el.dataset.control = id;
      el.setAttribute("aria-label", "Move " + name);
      el.textContent = name;
      buttons.set(id, el);
      items.append(el);
      el.onpointerdown = (e) => {
        e.preventDefault();
        if (drag) return;
        selected = id;
        const r = el.getBoundingClientRect();
        drag = {
          id,
          pointer: e.pointerId,
          dx: e.clientX - r.x - r.width / 2,
          dy: e.clientY - r.y - r.height / 2,
        };
        el.setPointerCapture(e.pointerId);
        overlay.classList.add("dragging");
        refresh();
      };
      el.onpointermove = (e) => {
        if (!drag || drag.pointer !== e.pointerId) return;
        const { w, h } = dimensions();
        draft.positions[id] = {
          x: (e.clientX - drag.dx) / w,
          y: (e.clientY - drag.dy) / h,
          size: draft.positions[id]?.size || 1,
        };
        refresh();
      };
      const end = (e) => {
        if (drag?.pointer !== e.pointerId) return;
        drag = null;
        overlay.classList.remove("dragging");
        const r = el.getBoundingClientRect(),
          { w, h } = dimensions();
        draft.positions[id] = {
          x: (r.x + r.width / 2) / w,
          y: (r.y + r.height / 2) / h,
          size: draft.positions[id]?.size || 1,
        };
      };
      el.onpointerup = el.onpointercancel = el.onlostpointercapture = end;
      el.onkeydown = (e) => {
        if (
          !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        )
          return;
        e.preventDefault();
        selected = id;
        const r = controlRect(
            id,
            draft,
            overlay.clientWidth,
            overlay.clientHeight,
          ),
          { w, h } = dimensions();
        draft.positions[id] = {
          x:
            (r.x +
              r.w / 2 +
              (e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0)) /
            w,
          y:
            (r.y +
              r.h / 2 +
              (e.key === "ArrowDown" ? 5 : e.key === "ArrowUp" ? -5 : 0)) /
            h,
          size: draft.positions[id]?.size || 1,
        };
        refresh();
      };
    }
    select.onchange = () => {
      selected = select.value;
      refresh();
    };
    size.oninput = () => {
      const { w, h } = dimensions(),
        r = controlRect(selected, draft, w, h);
      draft.positions[selected] = {
        x: (r.x + r.w / 2) / w,
        y: (r.y + r.h / 2) / h,
        size: Number(size.value) / 100,
      };
      refresh();
    };
    opacity.oninput = () => {
      draft.opacity = Number(opacity.value) / 100;
      refresh();
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(overlay);
    const close = () => {
      observer.disconnect();
      overlay.remove();
      onClose();
    };
    // Pointer-up remains reliable immediately after a captured drag, even when
    // the browser suppresses its compatibility click. Ignore the later click.
    const action = (id, run) => {
      const button = overlay.querySelector(id);
      let touched = -Infinity;
      button.onpointerup = (e) => {
        if (e.pointerType === "touch") {
          e.preventDefault();
          touched = performance.now();
          // Closing on pointer-up can expose a button underneath before the native
          // compatibility click. Consume only that same pointer's following click.
          const pointer = e.pointerId,
            x = e.clientX,
            y = e.clientY;
          const consume = (click) => {
            if (
              click.isTrusted &&
              ("pointerId" in click
                ? click.pointerId === pointer
                : Math.hypot(click.clientX - x, click.clientY - y) < 3)
            ) {
              click.preventDefault();
              click.stopImmediatePropagation();
            }
          };
          document.addEventListener("click", consume, {
            capture: true,
            once: true,
          });
          setTimeout(
            () => document.removeEventListener("click", consume, true),
            600,
          );
          run(e);
        }
      };
      button.onclick = (e) => {
        if (performance.now() - touched > 600) run(e);
      };
    };
    action("#editor-cancel", close);
    action("#editor-save", () => {
      this.data = validateTouchLayout(draft);
      try {
        localStorage.setItem(TOUCH_LAYOUT_KEY, JSON.stringify(this.data));
        ui.displayMessage("Touch layout saved on this browser.");
      } catch {
        ui.displayMessage(
          "Storage unavailable. Touch layout will last for this session.",
        );
      }
      close();
    });
    action("#editor-reset", () => {
      Object.assign(draft, validateTouchLayout(null));
      refresh();
      overlay.querySelector("#editor-status").textContent =
        "Default positions restored. Save to keep them, or Cancel to retain your layout.";
    });
    action("#editor-collapse", (e) => {
      const hidden = overlay.classList.toggle("options-hidden");
      e.currentTarget.textContent = hidden ? "SHOW OPTIONS" : "HIDE OPTIONS";
    });
    refresh();
  }
}
