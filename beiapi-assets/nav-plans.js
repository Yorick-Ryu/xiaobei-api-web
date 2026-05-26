(function () {
  var href = "/plans";
  var label = "套餐充值";
  var doneParents = new WeakSet();

  function normalize(url) {
    try {
      return new URL(url, location.origin).pathname.replace(/\/+$/, "") || "/";
    } catch (_) {
      return "";
    }
  }

  function setText(node) {
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    var texts = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) texts.push(walker.currentNode);
    }
    if (texts.length) {
      texts[texts.length - 1].nodeValue = label;
    } else {
      node.textContent = label;
    }
  }

  function makeLink(template) {
    var link = template.cloneNode(true);
    link.href = href;
    link.removeAttribute("aria-current");
    link.removeAttribute("data-status");
    link.classList.remove("active");
    setText(link);
    return link;
  }

  function inject() {
    var pricingLinks = Array.from(document.querySelectorAll('a[href]')).filter(function (item) {
      return normalize(item.getAttribute("href")) === "/pricing";
    });
    pricingLinks.forEach(function (pricing) {
      if (!pricing.parentElement || doneParents.has(pricing.parentElement)) return;
      if (
        Array.from(pricing.parentElement.querySelectorAll("a[href]")).some(function (item) {
          return normalize(item.getAttribute("href")) === href;
        })
      ) {
        doneParents.add(pricing.parentElement);
        return;
      }
      pricing.insertAdjacentElement("afterend", makeLink(pricing));
      doneParents.add(pricing.parentElement);
    });
  }

  inject();
  new MutationObserver(inject).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
