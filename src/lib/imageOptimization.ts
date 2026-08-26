export const getOptimizedImage = async (
  base64String: string,
  maxWidth = 2560,
  maxHeight = 1440,
  quality = 0.9,
): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Only downscale. Never upscale a chart screenshot because doing so
        // adds bytes without recovering any missing candle/indicator detail.
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64String.replace(/^data:image\/\w+;base64,/, ""));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Keep the source MIME when possible. PNG remains lossless, while
        // JPEG/WebP get high-quality compression for smaller requests.
        const sourceMime = base64String.match(/^data:(image\/(?:jpeg|png|webp));base64,/)?.[1];
        const mime = sourceMime || "image/jpeg";
        const dataUrl = canvas.toDataURL(mime, quality);
        resolve(dataUrl.replace(/^data:image\/\w+;base64,/, ""));
      };

      img.onerror = () => {
        resolve(base64String.replace(/^data:image\/\w+;base64,/, ""));
      };

      if (base64String.startsWith("data:")) {
        img.src = base64String;
      } else {
        img.src = `data:image/jpeg;base64,${base64String}`;
      }
    } catch {
      resolve(base64String.replace(/^data:image\/\w+;base64,/, ""));
    }
  });
};
