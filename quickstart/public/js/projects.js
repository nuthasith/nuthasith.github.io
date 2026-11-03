(function () {
  "use strict";

  function initializeModels() {
    var dialog = document.getElementById("project-model-dialog");
    var stage = document.getElementById("project-model-stage");
    var title = document.getElementById("project-model-title");
    var status = document.getElementById("project-model-status");
    var closeButton = document.getElementById("project-model-close");
    var retryButton = document.getElementById("project-model-retry");
    var externalLink = document.getElementById("project-model-external");
    if (!dialog || !stage || !title || !status || !closeButton || !retryButton || !externalLink) return;

    var moduleURL = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    var modulePromise;
    var generation = 0;
    var origin;
    var currentModel;
    var currentVideo;
    var releaseViewer;
    var supportsModal = typeof dialog.showModal === "function";

    function isOpen() {
      return dialog.hasAttribute("open");
    }

    function clearStage() {
      if (releaseViewer) releaseViewer();
      releaseViewer = undefined;
      stage.replaceChildren();
      stage.classList.remove("is-loading", "is-video");
      stage.removeAttribute("aria-busy");
    }

    function cleanup() {
      generation += 1;
      clearStage();
      currentModel = undefined;
      currentVideo = undefined;
      retryButton.hidden = true;
      externalLink.hidden = true;
      status.textContent = "";
      var returnTo = origin;
      origin = undefined;
      if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
    }

    function dismiss() {
      if (supportsModal) dialog.close();
      else dialog.removeAttribute("open");
      cleanup();
    }

    function loadModule() {
      if (window.customElements && window.customElements.get("model-viewer")) return Promise.resolve();
      if (modulePromise) return modulePromise;

      modulePromise = new Promise(function (resolve, reject) {
        var timeout = window.setTimeout(function () {
          reject(new Error("The 3D viewer took too long to load."));
        }, 20000);

        import(moduleURL).then(function () {
          if (!window.customElements || !window.customElements.get("model-viewer")) {
            throw new Error("The 3D viewer is not available in this browser.");
          }
          window.clearTimeout(timeout);
          resolve();
        }).catch(function (error) {
          window.clearTimeout(timeout);
          reject(error);
        });
      }).catch(function (error) {
        modulePromise = undefined;
        throw error;
      });

      return modulePromise;
    }

    function loadModel() {
      var attempt = ++generation;
      var model = currentModel;
      clearStage();
      retryButton.hidden = true;
      stage.classList.add("is-loading");
      stage.setAttribute("aria-busy", "true");
      status.textContent = "Loading 3D model…";

      function isCurrent() {
        return attempt === generation && isOpen();
      }

      function unavailable() {
        if (!isCurrent()) return;
        clearStage();
        var message = document.createElement("p");
        message.className = "project-model-fallback";
        message.textContent = "The 3D preview is unavailable.";
        stage.appendChild(message);
        status.textContent = "Please try again.";
        retryButton.hidden = false;
      }

      loadModule().then(function () {
        if (!isCurrent()) return;
        var viewer = document.createElement("model-viewer");
        viewer.setAttribute("src", model.src);
        viewer.setAttribute("alt", model.title + " — interactive 3D model");
        if (model.poster) viewer.setAttribute("poster", model.poster);
        viewer.setAttribute("camera-controls", "");
        viewer.setAttribute("shadow-intensity", "0.4");
        viewer.setAttribute("camera-orbit", "45deg 70deg auto");
        viewer.setAttribute("loading", "eager");
        viewer.setAttribute("interaction-prompt", "none");

        var timeout = window.setTimeout(unavailable, 45000);
        function loaded() {
          if (!isCurrent()) return;
          window.clearTimeout(timeout);
          stage.classList.remove("is-loading");
          stage.removeAttribute("aria-busy");
          status.textContent = "Drag or use arrow keys to rotate · Scroll or pinch to zoom";
        }

        viewer.addEventListener("load", loaded, { once: true });
        viewer.addEventListener("error", unavailable, { once: true });
        releaseViewer = function () {
          window.clearTimeout(timeout);
          viewer.removeEventListener("load", loaded);
          viewer.removeEventListener("error", unavailable);
        };
        stage.appendChild(viewer);
      }).catch(unavailable);
    }

    function loadVideo() {
      generation += 1;
      clearStage();
      retryButton.hidden = true;
      stage.classList.add("is-video");
      var frame = document.createElement("iframe");
      // The privacy-enhanced host sets no YouTube cookies until the video plays.
      frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(currentVideo.id) + "?autoplay=1&rel=0";
      frame.title = currentVideo.title + " — video";
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      stage.appendChild(frame);
      status.textContent = "";
      externalLink.href = currentVideo.url;
      externalLink.hidden = false;
    }

    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-model-open], [data-video-open]");
      if (!button) return;
      var videoId = button.dataset.videoId;
      if (!videoId && !button.dataset.modelSrc) return;
      // Let modified clicks on video links open YouTube in a new tab as usual.
      if (videoId && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
      event.preventDefault();
      origin = button;
      if (videoId) {
        currentVideo = {
          id: videoId,
          title: button.dataset.videoTitle || "Video",
          url: button.href || "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId)
        };
        title.textContent = currentVideo.title;
      } else {
        currentModel = {
          src: button.dataset.modelSrc,
          title: button.dataset.modelTitle || "3D model",
          poster: button.dataset.modelPoster || ""
        };
        title.textContent = currentModel.title;
      }
      if (!isOpen()) {
        if (supportsModal) dialog.showModal();
        else dialog.setAttribute("open", "");
      }
      closeButton.focus({ preventScroll: true });
      if (videoId) loadVideo();
      else loadModel();
    });

    closeButton.addEventListener("click", dismiss);
    retryButton.addEventListener("click", function () {
      if (currentModel && isOpen()) {
        closeButton.focus({ preventScroll: true });
        loadModel();
      }
    });
    dialog.addEventListener("close", function () {
      // A queued close event may belong to an earlier opening.
      if (!isOpen()) cleanup();
    });
    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      var bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
    });
    if (!supportsModal) {
      dialog.addEventListener("keydown", function (event) {
        if (event.key === "Escape") dismiss();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeModels, { once: true });
  else initializeModels();
})();
