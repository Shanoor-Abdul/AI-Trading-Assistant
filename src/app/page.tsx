"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTradingStore } from "@/store/useTradingStore";
import { hasSignificantVisualChange } from "@/lib/observation/visualChange";
import { createObservationSessionKey } from "@/lib/observation/session";

