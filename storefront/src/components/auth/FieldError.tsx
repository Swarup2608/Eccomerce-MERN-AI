interface FieldErrorProps {
  id: string;
  message?: string;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;

  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}

export function fieldClassName(hasError: boolean) {
  return hasError
    ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100"
    : "border-gray-200 bg-gray-50 focus:border-orange-400 focus:ring-orange-100";
}
