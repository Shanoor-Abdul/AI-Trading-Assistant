export interface SentimentData {
  score: number; // 0-100 (0=Extreme Fear, 100=Extreme Greed)
  label: string;
  timestamp: number;
}

export class AlternativeDataHook {
  private currentSentiment: SentimentData = { score: 50, label: "Neutral", timestamp: Date.now() };

  public async fetchCryptoFearAndGreed(): Promise<SentimentData> {
    try {
      const res = await fetch("https://api.alternative.me/fng/");
      const data = await res.json();
      if (data && data.data && data.data.length > 0) {
        const today = data.data[0];
        this.currentSentiment = {
          score: parseInt(today.value),
          label: today.value_classification,
          timestamp: parseInt(today.timestamp) * 1000
        };
      }
      return this.currentSentiment;
    } catch (err) {
      console.error("[AltData] Failed to fetch sentiment:", err);
      return this.currentSentiment;
    }
  }

  public getSentiment(): SentimentData {
    return this.currentSentiment;
  }
}

export const altDataHook = new AlternativeDataHook();
