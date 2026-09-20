"use client"

import React from 'react'
import { Card } from '../ui/card'
import Image from 'next/image'
import { UserValues } from '@/lib/validation'

interface UserCardProps {
  userData: UserValues
}

const UserCard = ({ userData }: UserCardProps) => {
  const currentMonthContributions = userData.contributions?.filter(
    (contribution) =>
      contribution.month.getMonth() === new Date().getMonth() &&
      contribution.month.getFullYear() === new Date().getFullYear()
  )[0]
  const currentMonth = new Date().toLocaleString('default', { month: 'long' })

  return (
    <Card className="relative aspect-[1.7/1] bg-zinc-900 border-zinc-800 overflow-hidden shadow-2xl group transition-all duration-700 hover:scale-[1.01] hover:shadow-emerald-500/10 rounded-2xl">
      {/* Background Gradients & Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/50 via-zinc-900 to-black z-0" />
      <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.15),transparent_70%)]" />
      <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(circle_at_bottom_left,hsla(0,0%,100%,0.03),transparent_40%)]" />

      {/* Logo Pattern Overlay (Subtle) */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/assets/images/logo.png')] bg-[length:60px_60px] bg-repeat z-0" />

      {/* Glossy Reflection */}
      <div className="absolute -top-[100%] -left-[100%] w-[300%] h-[300%] bg-[linear-gradient(45deg,transparent_45%,rgba(255,255,255,0.05)_50%,transparent_55%)] transition-all duration-1000 group-hover:top-[-50%] group-hover:left-[-50%] pointer-events-none" />

      <div className="relative z-10 h-full p-10 md:p-12 lg:p-14 flex flex-col justify-between">
        {/* Top Section */}
        <div className="flex justify-between items-start">
          <div className="space-y-4">
            {/* Realistic Chip */}
            <div className="relative w-20 h-14 rounded-xl overflow-hidden shadow-2xl border border-white/10">
                <Image
                    src="/assets/images/credit-card.png"
                    alt="Card Chip"
                    fill
                    className="object-cover"
                />
            </div>
          </div>

          <div className="flex items-center gap-6 text-right">
            <div className="flex flex-col uppercase text-left">
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-white">DEVOPS AFRICA</h1>
              <p className="mt-1 text-xs font-black text-white/80 tracking-[0.2em] leading-tight">
                 &nbsp;EMPLOYEE MANAGEMENT SYSTEM
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/10 backdrop-blur-md">
              <Image
                src="/assets/images/dem-logo.svg"
                alt="DEM logo"
                width={56}
                height={56}
                className="object-contain"
              />
            </div>
          </div>
        </div>

        {/* Middle Section - Card Name */}
        <div className="mt-6 mb-8">
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight uppercase italic drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] leading-none">
            {userData.name}
          </h2>
        </div>

        {/* Bottom Section - Status */}
        <div className="flex justify-between items-end border-t border-white/5 pt-6">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
              Current Month
            </p>
            <p className="text-sm font-bold text-[#D3A94C] uppercase tracking-wider">
              {currentMonth}
            </p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
              Dues Owed
            </p>
            <div className="flex items-center gap-2 justify-end">
              <div className={`w-1.5 h-1.5 rounded-full ${currentMonthContributions ? "bg-emerald-500 animate-pulse" : "bg-orange-500"}`} />
              <p className="text-sm font-bold uppercase tracking-wider text-[#D3A94C]">
                {currentMonthContributions ? "PAID" : "PENDING"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default UserCard