import { useLocalSearchParams } from "expo-router";
import PlanPanel from "../../components/PlanPanel";

export default function PlanScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return <PlanPanel planId={planId ?? ""} />;
}
