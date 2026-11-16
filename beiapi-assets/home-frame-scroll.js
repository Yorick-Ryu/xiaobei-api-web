// The homepage scrolls inside a sandboxed iframe; use the same PublicHeader
// utility classes as native pages when that frame crosses the 20px threshold.
(function () {
  var homeFrame = null;
  var homeScrolled = false;
  var frameRequested = null;
  var pending = false;
  var containerExpanded = ["max-w-7xl", "px-4", "pt-0", "md:px-6"];
  var containerCompact = ["max-w-[52rem]", "px-3", "pt-3"];
  var navExpanded = ["h-16", "px-2"];
  var navCompact = [
    "bg-background/60", "ring-border/50", "h-12", "rounded-2xl", "pr-1.5", "pl-4",
    "shadow-[0_2px_16px_-6px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.02)]",
    "ring-[0.5px]", "backdrop-blur-2xl",
    "dark:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.4)]",
  ];

  function currentHomeFrame() {
    if (location.pathname !== "/") return null;
    return Array.from(document.querySelectorAll("iframe[src]")).find(function (frame) {
      var url = new URL(frame.src, location.origin);
      return url.origin === location.origin && url.pathname === "/beiapi-home/";
    }) || null;
  }

  function toggleClasses(element, classes, enabled) {
    classes.forEach(function (name) {
      if (element.classList.contains(name) !== enabled) {
        element.classList.toggle(name, enabled);
      }
    });
  }

  function syncHeader() {
    pending = false;
    var frame = currentHomeFrame();
    var previouslyActive = !!homeFrame;
    if (frame !== homeFrame) {
      homeFrame = frame;
      homeScrolled = false;
      frameRequested = null;
    }
    if (!frame && !previouslyActive) return;
    var header = document.querySelector('header.pointer-events-none.fixed');
    var container = header && header.firstElementChild;
    var nav = container && container.querySelector("nav");
    if (!nav || !nav.classList.contains("transition-all")) return;
    var compact = window.scrollY > 20 || (!!frame && homeScrolled);
    toggleClasses(container, containerExpanded, !compact);
    toggleClasses(container, containerCompact, compact);
    toggleClasses(nav, navExpanded, !compact);
    toggleClasses(nav, navCompact, compact);
    if (frame && frame !== frameRequested) {
      frameRequested = frame;
      // The configured sandbox deliberately gives the frame an opaque origin.
      frame.contentWindow.postMessage({ type: "beiapi:home-scroll-request" }, "*");
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(syncHeader);
  }

  window.addEventListener("message", function (event) {
    var frame = currentHomeFrame();
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.origin !== "null" && event.origin !== location.origin) return;
    if (event.data?.type !== "beiapi:home-scroll" || typeof event.data.scrolled !== "boolean") return;
    homeFrame = frame;
    homeScrolled = event.data.scrolled;
    schedule();
  });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("popstate", schedule);
  window.addEventListener("pageshow", schedule);
  document.addEventListener("load", function (event) {
    if (event.target === homeFrame) {
      frameRequested = null;
      schedule();
    }
  }, true);
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  schedule();
})();
