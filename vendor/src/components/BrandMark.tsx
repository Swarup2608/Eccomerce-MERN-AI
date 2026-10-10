import { FiShoppingBag } from "react-icons/fi";

export default function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
        <FiShoppingBag size={19} />
      </span>
      <span className="text-lg font-black tracking-tight">
        shopsphere <span className="font-semibold text-primary">seller hub</span>
      </span>
    </span>
  );
}
