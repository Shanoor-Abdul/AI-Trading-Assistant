import { del, get, keys, set } from "idb-keyval";

const IMAGE_PREFIX = "trading-image:";

function imageKey(id: string): string {
  return `${IMAGE_PREFIX}${id}`;
}

export const ImageStore = {
  async saveImage(id: string, base64: string): Promise<void> {
    if (!id) throw new Error("ImageStore.saveImage requires an image id");
    if (!base64) throw new Error("ImageStore.saveImage requires image data");

    await set(imageKey(id), base64);
  },

  async getImage(id: string): Promise<string | null> {
    if (!id) return null;

    return (await get<string>(imageKey(id))) ?? null;
  },

  async deleteImage(id: string): Promise<void> {
    if (!id) return;

    await del(imageKey(id));
  },

  async hasImage(id: string): Promise<boolean> {
    if (!id) return false;

    return (await get<string>(imageKey(id))) != null;
  },

  async clearAllImages(): Promise<void> {
    const allKeys = await keys();

    const imageKeys = allKeys.filter(
      (key) =>
        typeof key === "string" && key.startsWith(IMAGE_PREFIX),
    );

    await Promise.all(imageKeys.map((key) => del(key)));
  },
};