import AsyncStorage from "@react-native-async-storage/async-storage";

const MEDICATIONS_KEY = "@medications";
const DOSE_HISTORY_KEY = "@dose_history";

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  startDate: string;
  duration: string;
  color: string;
  reminderEnabled: boolean;
  currentSupply: number;
  totalSupply: number;
  refillAt: number;
  refillReminder: boolean;
  lastRefillDate?: string;
}

export interface DoseHistory {
  id: string;
  medicationId: string;
  timestamp: string;
  taken: boolean;
}

export interface MedicationScheduleEntry {
  id: string;
  medication: Medication;
  time: string;
  taken: boolean;
  date: string;
}

export async function getMedications(): Promise<Medication[]> {
  try {
    const data = await AsyncStorage.getItem(MEDICATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting medications:", error);
    return [];
  }
}

export async function addMedication(medication: Medication): Promise<void> {
  try {
    const medications = await getMedications();
    medications.push(medication);
    await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
  } catch (error) {
    console.error("Error adding medication:", error);
    throw error;
  }
}

export async function updateMedication(
  updatedMedication: Medication
): Promise<void> {
  try {
    const medications = await getMedications();
    const index = medications.findIndex(
      (med) => med.id === updatedMedication.id
    );
    if (index !== -1) {
      medications[index] = updatedMedication;
      await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
    }
  } catch (error) {
    console.error("Error updating medication:", error);
    throw error;
  }
}

export async function deleteMedication(id: string): Promise<void> {
  try {
    const medications = await getMedications();
    const updatedMedications = medications.filter((med) => med.id !== id);
    await AsyncStorage.setItem(
      MEDICATIONS_KEY,
      JSON.stringify(updatedMedications)
    );
  } catch (error) {
    console.error("Error deleting medication:", error);
    throw error;
  }
}

export async function getDoseHistory(): Promise<DoseHistory[]> {
  try {
    const data = await AsyncStorage.getItem(DOSE_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting dose history:", error);
    return [];
  }
}

export async function getTodaysDoses(): Promise<DoseHistory[]> {
  try {
    const history = await getDoseHistory();
    const today = new Date().toDateString();
    return history.filter(
      (dose) => new Date(dose.timestamp).toDateString() === today
    );
  } catch (error) {
    console.error("Error getting today's doses:", error);
    return [];
  }
}

export async function recordDose(
  medicationId: string,
  taken: boolean,
  timestamp: string
): Promise<void> {
  try {
    const history = await getDoseHistory();
    const newDose: DoseHistory = {
      id: Math.random().toString(36).substr(2, 9),
      medicationId,
      timestamp,
      taken,
    };

    history.push(newDose);
    await AsyncStorage.setItem(DOSE_HISTORY_KEY, JSON.stringify(history));

    // Update medication supply if taken
    if (taken) {
      const medications = await getMedications();
      const medication = medications.find((med) => med.id === medicationId);
      if (medication && medication.currentSupply > 0) {
        medication.currentSupply -= 1;
        await updateMedication(medication);
      }
    }
  } catch (error) {
    console.error("Error recording dose:", error);
    throw error;
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([MEDICATIONS_KEY, DOSE_HISTORY_KEY]);
  } catch (error) {
    console.error("Error clearing data:", error);
    throw error;
  }
}

export function isMedicationActiveOnDate(
  medication: Medication,
  date: Date
): boolean {
  const startDate = new Date(medication.startDate);
  startDate.setHours(0, 0, 0, 0);

  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  const durationDays = parseInt(medication.duration, 10);
  const durationLabel = medication.duration.toLowerCase();
  const isOngoing =
    durationLabel.includes("ongoing") || durationDays < 0 || Number.isNaN(durationDays);

  if (isOngoing) {
    return checkDate >= startDate;
  }

  if (durationDays <= 0) {
    return false;
  }

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + durationDays - 1);

  return checkDate >= startDate && checkDate <= endDate;
}

export function getScheduleEntriesForDate(
  medications: Medication[],
  history: DoseHistory[],
  date: Date
): MedicationScheduleEntry[] {
  const dateStr = date.toDateString();
  const dayDoses = history.filter(
    (dose) => new Date(dose.timestamp).toDateString() === dateStr
  );

  const entries: MedicationScheduleEntry[] = [];

  for (const medication of medications) {
    if (!isMedicationActiveOnDate(medication, date)) continue;

    for (const time of medication.times) {
      const taken = dayDoses.some(
        (dose) =>
          dose.medicationId === medication.id &&
          dose.taken &&
          new Date(dose.timestamp).toTimeString().slice(0, 5) === time
      );

      entries.push({
        id: `${medication.id}-${time}`,
        medication,
        time,
        taken,
        date: dateStr,
      });
    }
  }

  return entries;
}

export function getMedicinesDueInNextHour(
  medications: Medication[],
  history: DoseHistory[]
): Medication[] {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const today = now.toDateString();

  // Get already taken medicines for today
  const takenTodayByMedId = new Set(
    history
      .filter((dose) => new Date(dose.timestamp).toDateString() === today && dose.taken)
      .map((dose) => dose.medicationId)
  );

  const medicinesDue: Medication[] = [];

  for (const medication of medications) {
    // Check if medication is active today
    if (!isMedicationActiveOnDate(medication, now)) continue;

    // Skip if all doses for this medication already taken today
    if (takenTodayByMedId.has(medication.id)) continue;

    // Check if any scheduled time falls within the next hour
    const isDueInNextHour = medication.times.some((time) => {
      const [hours, minutes] = time.split(":").map(Number);
      const scheduledTime = new Date();
      scheduledTime.setHours(hours, minutes, 0, 0);

      return scheduledTime >= now && scheduledTime <= oneHourLater;
    });

    if (isDueInNextHour) {
      medicinesDue.push(medication);
    }
  }

  return medicinesDue;
}
