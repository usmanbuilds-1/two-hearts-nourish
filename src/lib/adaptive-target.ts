/**
 * Adaptive calorie target model based on Hall et al. 2011 (Lancet) long-term
 * linearized adult body-weight model, equations 11-15 of the web appendix.
 *
 * This module never uses AI to determine calorie targets.
 * Source model:
 * Hall KD et al. Quantification of the effect of energy imbalance on bodyweight.
 * Lancet. 2011;378:826-837. doi:10.1016/S0140-6736(11)60812-X
 */

// Conservative PRODUCT safety gates, not thresholds validated in Hall 2011.
// A mathematically narrow residual-only CI from 2-3 weight observations must
// never be presented as a reliable basis for automatic calorie changes.
export const MIN_COMPLETE_INTAKE_DAYS = 21;
export const MIN_WEIGHT_READINGS = 4;
export const MIN_WEIGHT_SPAN_DAYS = 14;

export function sufficientAdaptiveEvidence(
  completeDays: number,
  weightDates: string[],
): boolean {
  if (completeDays < MIN_COMPLETE_INTAKE_DAYS || weightDates.length < MIN_WEIGHT_READINGS) return false;
  const dates = [...new Set(weightDates)].sort();
  if (dates.length < MIN_WEIGHT_READINGS) return false;
  const first = Date.parse(dates[0]! + "T00:00:00Z");
  const last = Date.parse(dates[dates.length - 1]! + "T00:00:00Z");
  return Number.isFinite(first) && Number.isFinite(last) &&
    last - first >= MIN_WEIGHT_SPAN_DAYS * 86_400_000;
}

export type HallSex = "male" | "female";

export type HallParameters = {
  initialFatKg: number;
  alpha: number;
  rhoKjPerKg: number;
  epsilonKjPerKgDay: number;
  tauDays: number;
};

export type DatedWeightPoint = {
  dayIndex: number;
  weightKg: number;
};

export type HallMaintenanceFit = {
  maintenanceKcal: number;
  maintenanceCi95Low: number;
  maintenanceCi95High: number;
  residualRmseKg: number;
  parameterStandardErrorKcal: number;
  weightPoints: number;
};

const KJ_PER_KCAL = 4.184;
const RHO_F = 39_500; // kJ/kg, Hall appendix
const RHO_L = 7_600;  // kJ/kg
const ETA_F = 750;    // kJ/kg
const ETA_L = 960;    // kJ/kg
const GAMMA_F = 13;   // kJ/kg/day
const GAMMA_L = 92;   // kJ/kg/day
const BETA_TEF = 0.10;
const BETA_AT = 0.14;
const BETA = BETA_TEF + BETA_AT;
const FORBES_C_KG = 10.4;

/**
 * Jackson et al. body-fat regressions as reproduced in Hall 2011 web appendix,
 * equation 4. Returns fat mass in kilograms.
 */
export function hallInitialFatKg(input: {
  weightKg: number;
  heightM: number;
  age: number;
  sex: HallSex;
}): number | null {
  const { weightKg, heightM, age, sex } = input;
  if (![weightKg, heightM, age].every(Number.isFinite) || weightKg <= 0 || heightM <= 0 || age <= 0) return null;
  const bmi = weightKg / (heightM * heightM);
  const pct = sex === "male"
    ? 0.14 * age + 37.31 * Math.log(bmi) - 103.94
    : 0.14 * age + 39.96 * Math.log(bmi) - 102.01;
  const fatKg = weightKg * pct / 100;
  return Number.isFinite(fatKg) && fatKg > 0 && fatKg < weightKg ? fatKg : null;
}

/**
 * Hall long-term model parameters from equations 12, 13, and 15.
 *
 * PAL is the physical-activity level EE/RMR used by the NIH Body Weight Planner.
 * NIDDK describes typical adult PAL values as roughly 1.4-2.5.
 */
export function hallLongTermParameters(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: HallSex;
  pal: number;
  restingMetabolicRateKcal: number;
}): HallParameters | null {
  const { weightKg, heightCm, age, sex, pal, restingMetabolicRateKcal } = input;
  if (
    ![weightKg, heightCm, age, pal, restingMetabolicRateKcal].every(Number.isFinite) ||
    weightKg <= 0 || heightCm <= 0 || age <= 0 || restingMetabolicRateKcal <= 0 ||
    pal < 1.4 || pal > 2.5
  ) return null;

  const initialFatKg = hallInitialFatKg({
    weightKg,
    heightM: heightCm / 100,
    age,
    sex,
  });
  if (!initialFatKg) return null;

  const alpha = FORBES_C_KG / initialFatKg;
  const rmrKj = restingMetabolicRateKcal * KJ_PER_KCAL;

  // Hall appendix equation 8.
  const delta = (((1 - BETA_TEF) * pal) - 1) * rmrKj / weightKg;

  // Hall appendix equations 12 and 13.
  const rhoKjPerKg =
    (ETA_F + RHO_F + alpha * (ETA_L + RHO_L)) /
    ((1 - BETA) * (1 + alpha));

  const epsilonKjPerKgDay =
    (1 / (1 - BETA)) *
    (((GAMMA_F + alpha * GAMMA_L) / (1 + alpha)) + delta);

  const tauDays = rhoKjPerKg / epsilonKjPerKgDay;
  if (
    ![alpha, rhoKjPerKg, epsilonKjPerKgDay, tauDays].every(Number.isFinite) ||
    rhoKjPerKg <= 0 || epsilonKjPerKgDay <= 0 || tauDays <= 0
  ) return null;

  return {
    initialFatKg,
    alpha,
    rhoKjPerKg,
    epsilonKjPerKgDay,
    tauDays,
  };
}

/**
 * Exact one-day solution of Hall equation 14 under constant daily intake
 * during that day:
 *   d(BW-BW0)/dt = ΔEI/rho - (BW-BW0)/tau
 */
export function simulateHallWeightPath(input: {
  initialWeightKg: number;
  maintenanceKcal: number;
  intakesKcal: number[];
  parameters: HallParameters;
}): number[] {
  const { initialWeightKg, maintenanceKcal, intakesKcal, parameters } = input;
  const decay = Math.exp(-1 / parameters.tauDays);
  const oneMinusDecay = 1 - decay;
  let displacementKg = 0;
  const weights = [initialWeightKg];

  for (const intake of intakesKcal) {
    const deltaEiKj = (intake - maintenanceKcal) * KJ_PER_KCAL;
    const equilibriumDisplacementKg = deltaEiKj / parameters.epsilonKjPerKgDay;
    displacementKg =
      displacementKg * decay +
      equilibriumDisplacementKg * oneMinusDecay;
    weights.push(initialWeightKg + displacementKg);
  }
  return weights;
}

// Two-sided 95% Student-t critical values. df > 30 uses the asymptotic 1.96.
const T95: Record<number, number> = {
  1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,
  10:2.228,11:2.201,12:2.179,13:2.160,14:2.145,15:2.131,16:2.120,17:2.110,
  18:2.101,19:2.093,20:2.086,21:2.080,22:2.074,23:2.069,24:2.064,25:2.060,
  26:2.056,27:2.052,28:2.048,29:2.045,30:2.042,
};

function tCritical95(df: number): number {
  if (df <= 0) return Number.POSITIVE_INFINITY;
  return T95[df] ?? 1.96;
}

/**
 * Fits baseline maintenance intake (EI0) from a consecutive series of complete
 * intake days plus observed body weights. The Hall model is linear in EI0, so
 * ordinary least squares has a closed-form solution.
 *
 * dayIndex=0 should be the first weight date and weights are interpreted as
 * morning/body-weight observations before that day's intake.
 */
export function fitHallMaintenance(input: {
  initialWeightKg: number;
  intakesKcal: number[];
  weights: DatedWeightPoint[];
  parameters: HallParameters;
}): HallMaintenanceFit | null {
  const { initialWeightKg, intakesKcal, parameters } = input;
  const observations = input.weights
    .filter((point) =>
      Number.isInteger(point.dayIndex) &&
      point.dayIndex >= 0 &&
      point.dayIndex <= intakesKcal.length &&
      Number.isFinite(point.weightKg) &&
      point.weightKg > 0
    )
    .sort((a, b) => a.dayIndex - b.dayIndex);

  if (observations.length < 3 || observations[0]?.dayIndex !== 0) return null;

  // Predictions at EI0=0 and EI0=1 establish exact linear sensitivity to EI0.
  const p0 = simulateHallWeightPath({
    initialWeightKg,
    maintenanceKcal: 0,
    intakesKcal,
    parameters,
  });
  const p1 = simulateHallWeightPath({
    initialWeightKg,
    maintenanceKcal: 1,
    intakesKcal,
    parameters,
  });

  let ssSensitivity = 0;
  let cross = 0;
  let informative = 0;
  for (const point of observations) {
    const sensitivity = p1[point.dayIndex]! - p0[point.dayIndex]!;
    if (Math.abs(sensitivity) < 1e-12) continue;
    ssSensitivity += sensitivity * sensitivity;
    cross += sensitivity * (point.weightKg - p0[point.dayIndex]!);
    informative++;
  }

  if (informative < 2 || ssSensitivity <= 0) return null;
  const maintenanceKcal = cross / ssSensitivity;
  if (!Number.isFinite(maintenanceKcal) || maintenanceKcal <= 0) return null;

  const prediction = simulateHallWeightPath({
    initialWeightKg,
    maintenanceKcal,
    intakesKcal,
    parameters,
  });

  let sse = 0;
  for (const point of observations) {
    const residual = point.weightKg - prediction[point.dayIndex]!;
    sse += residual * residual;
  }

  // One fitted parameter (EI0); day-0 contributes no EI0 sensitivity.
  const df = informative - 1;
  if (df <= 0) return null;
  const residualVariance = sse / df;
  const parameterStandardErrorKcal =
    Math.sqrt(residualVariance / ssSensitivity);
  const critical = tCritical95(df);
  const margin = critical * parameterStandardErrorKcal;

  return {
    maintenanceKcal,
    maintenanceCi95Low: maintenanceKcal - margin,
    maintenanceCi95High: maintenanceKcal + margin,
    residualRmseKg: Math.sqrt(sse / observations.length),
    parameterStandardErrorKcal,
    weightPoints: observations.length,
  };
}

/**
 * Converts a user-selected weekly body-weight-rate target into calorie intake
 * using Hall equation 11 evaluated at the current body weight.
 *
 * targetRatePctPerWeek is chosen by the user from evidence-supported ranges;
 * this function does not invent that preference.
 */
export function hallTargetCalories(input: {
  fittedBaselineMaintenanceKcal: number;
  fittedMaintenanceCi95Low: number;
  fittedMaintenanceCi95High: number;
  initialWeightKg: number;
  currentWeightKg: number;
  targetRatePctPerWeek: number;
  parameters: HallParameters;
}) {
  const {
    fittedBaselineMaintenanceKcal,
    fittedMaintenanceCi95Low,
    fittedMaintenanceCi95High,
    initialWeightKg,
    currentWeightKg,
    targetRatePctPerWeek,
    parameters,
  } = input;

  const epsilonKcalPerKgDay =
    parameters.epsilonKjPerKgDay / KJ_PER_KCAL;
  const rhoKcalPerKg =
    parameters.rhoKjPerKg / KJ_PER_KCAL;

  const maintenanceAtCurrentWeight =
    fittedBaselineMaintenanceKcal +
    epsilonKcalPerKgDay * (currentWeightKg - initialWeightKg);

  const maintenanceCi95Low =
    fittedMaintenanceCi95Low +
    epsilonKcalPerKgDay * (currentWeightKg - initialWeightKg);

  const maintenanceCi95High =
    fittedMaintenanceCi95High +
    epsilonKcalPerKgDay * (currentWeightKg - initialWeightKg);

  const desiredKgPerDay =
    currentWeightKg * (targetRatePctPerWeek / 100) / 7;

  const targetOffsetKcal =
    rhoKcalPerKg * desiredKgPerDay;

  return {
    maintenanceKcal: maintenanceAtCurrentWeight,
    maintenanceCi95Low,
    maintenanceCi95High,
    targetKcal: maintenanceAtCurrentWeight + targetOffsetKcal,
    targetCi95Low: maintenanceCi95Low + targetOffsetKcal,
    targetCi95High: maintenanceCi95High + targetOffsetKcal,
    desiredKgPerWeek:
      currentWeightKg * (targetRatePctPerWeek / 100),
  };
}


export type AdaptiveGoal = "lose" | "maintain" | "gain";

export function evidenceRateBounds(goal: AdaptiveGoal): {
  minPctPerWeek: number;
  maxPctPerWeek: number;
  source: string;
} {
  if (goal === "gain") {
    return {
      minPctPerWeek: 0.25,
      maxPctPerWeek: 0.5,
      source: "Iraki et al. Sports (Basel). 2019;7(7):154. PMID 31247944",
    };
  }
  if (goal === "lose") {
    return {
      minPctPerWeek: -1,
      maxPctPerWeek: -0.5,
      source: "Helms et al. JISSN. 2014;11:20. PMID 24864135",
    };
  }
  return {
    minPctPerWeek: 0,
    maxPctPerWeek: 0,
    source: "Maintenance target: zero intended body-weight change",
  };
}

export function isEvidenceSupportedRate(goal: AdaptiveGoal, ratePctPerWeek: number): boolean {
  if (!Number.isFinite(ratePctPerWeek)) return false;
  const bounds = evidenceRateBounds(goal);
  return ratePctPerWeek >= bounds.minPctPerWeek && ratePctPerWeek <= bounds.maxPctPerWeek;
}
