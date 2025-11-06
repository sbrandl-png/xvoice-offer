import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline' | 'secondary' | 'ghost' }
export function Button({ className = '', variant, ...props }: Props) {
  const base = 'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition'
  const variants: Record<string, string> = {
    default: 'bg-black text-white hover:opacity-90',
    outline: 'border border-neutral-300 bg-white hover:bg-neutral-50',
    secondary: 'bg-neutral-200 text-black hover:bg-neutral-300',
    ghost: 'bg-transparent hover:bg-neutral-100',
  }
  const v = variant ? variants[variant] : variants.default
  return <button className={`${base} ${v} ${className}`} {...props} />
}
