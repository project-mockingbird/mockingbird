import { useItem } from '@/hooks/useItems';

export interface TabLabelProps {
  selectedItemId: string | null;
}

export function TabLabel({ selectedItemId }: TabLabelProps) {
  const { data, isLoading } = useItem(selectedItemId);
  if (selectedItemId === null) return <>New Tab</>;
  if (isLoading) return <>...</>;
  return <>{data?.name ?? selectedItemId}</>;
}
