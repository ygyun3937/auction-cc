interface Props {
  title: string
  value: number
  unit: string
  icon: string
}

export function PriceSummaryCard({ title, value, unit, icon }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</span>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
    </div>
  )
}
