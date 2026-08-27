
export function validateStage1Data(data: any): any {
  let cleanData = { ...data };

  // 1. Sanity Check RSI
  if (cleanData.indicators && cleanData.indicators.RSI) {
    const rsi = cleanData.indicators.RSI;
    if (rsi.value !== null && (rsi.value < 0 || rsi.value > 100)) {
      console.warn("Validator: RSI value hallucinated out of bounds. Nullifying.");
      rsi.value = null;
    }
  }

  // 2. Add server-side derived insights
  cleanData.serverValidation = {
    isValid: true,
    warnings: []
  };

  if (!cleanData.currentPrice) {
    cleanData.serverValidation.warnings.push("Current price could not be confidently extracted.");
  }

  return cleanData;
}

