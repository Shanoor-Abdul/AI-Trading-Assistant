import { del, get, keys, set } from "idb-keyval";

const IMAGE_KEY_PREFIX = "img_";

function imageKey(id: string): string {
  return `${IMAGE_KEY_PREFIX}${id}`;
}

export const ImageStore = {
  async saveImage(id: string, base64: string): Promise<void> {
    if (!id) throw new Error("ImageStore.saveImage requires an image id");
    if (!base64) throw new Error("ImageStore.saveImage requires image data");
    await set(imageKey(id), base64);
  },

  async getImage(id: string): Promise<string | undefined> {
    if (!id) return undefined;
    return await get<string>(imageKey(id));
  },

  async deleteImage(id: string): Promise<void> {
    if (!id) return;
    await del(imageKey(id));
  },

  async hasImage(id: string): Promise<boolean> {
    if (!id) return false;
    return (await getImage(id)) !== undefined;
  },

  async clearAllImages(): Promise<void> {
    const allKeys = await keys();
    const imageKeys = allKeys.filter(
      (key) => typeof key === "string" && key.startsWith(IMAGE_KEY_PREFIX),
    );
    await Promise.all(imageKeys.map((key) => del(key)));
  },
};
