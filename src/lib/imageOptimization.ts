export const getOptimizedImage = async (
  base64String: string,
  maxWidth = 1280,
  maxHeight = 720,
  quality = 0.5
): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64String.replace(/^data:image\/\w+;base64,/, "")); // fallback
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        const mime = base64String.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";
        const dataUrl = canvas.toDataURL(mime, quality);
        resolve(dataUrl.replace(/^data:image\/\w+;base64,/, ""));
      };
      
      img.onerror = () => {
        resolve(base64String.replace(/^data:image\/\w+;base64,/, "")); // fallback
      };
      
      if (base64String.startsWith("data:")) {
        img.src = base64String;
      } else {
        img.src = `data:image/jpeg;base64,${base64String}`;
      }
    } catch (err) {
      resolve(base64String.replace(/^data:image\/\w+;base64,/, "")); // fallback
    }
  });
};
