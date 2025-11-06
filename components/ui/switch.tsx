import React from 'react'

export function Switch({ checked, onCheckedChange, id }: { checked: boolean; onCheckedChange: (v: boolean)=>void; id?: string }) {
  return (
    <button
      id={id}
      onClick={() => onCheckedChange(!checked)}
      type="button"
      aria-pressed={checked}
      className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-black' : 'bg-neutral-300'}`}
    >
      <span className={`absolute top-0.5 transition ${checked ? 'left-6' : 'left-0.5'}`}>
        <span className="block h-5 w-5 rounded-full bg-white shadow" />
      </span>
    </button>
  )
}
