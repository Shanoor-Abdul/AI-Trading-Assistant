import { get, set, del, keys } from 'idb-keyval';

export const ImageStore = {
  async saveImage(id: string, base64: string): Promise<void> {
    await set("img_", base64);
  },
  async getImage(id: string): Promise<string | undefined> {
    return await get("img_");
  },
  async deleteImage(id: string): Promise<void> {
    await del("img_");
  },
  async clearAllImages(): Promise<void> {
    const allKeys = await keys();
    const imgKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('img_'));
    for (const k of imgKeys) {
      await del(k);
    }
  }
};
