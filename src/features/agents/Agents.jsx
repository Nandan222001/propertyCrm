import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, Search, Plus,
  Download, ChevronDown, ChevronRight, Menu, X, ArrowUpRight, MoreHorizontal,
  CalendarDays, Building2, House, Receipt, FileText, Clock3, CheckCircle2,
  AlertCircle, SlidersHorizontal, Send, Eye, Edit2, LockKeyhole, RefreshCw,
  FileSpreadsheet, MapPin, IndianRupee, Mail, Phone, Activity, Trash2, LogOut,
  Sparkles, Check, CheckCircle, Printer, MessageCircle
} from 'lucide-react';
import { parseAmt, fmtINR, amountInWords, agentKey, todayLabel, openWhatsApp, waLink, isAdmin, canCreateBooking, canApprove, canCreateCustomer, canRecordPayment, canManageBills, isCustomer, isPendingStatus } from '../../utils';
import { projects, agents, seedUsers } from '../../data/seedData';

import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { Avatar } from '../../components/common/Avatar';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Agents({ search, notify, role }) {
  return (
    <>
      <RoleContextBanner role={role} page="Agents" />

      <div className="mini-stats four">
        <Mini title="ACTIVE SALES AGENTS" value="14" color="green-text" />
        <Mini title="BOOKINGS THIS MONTH" value="23" />
        <Mini title="SALES VALUE CLOSED" value="₹3.84 Cr" />
        <Mini title="COMMISSION POOL" value="₹7.68 L" color="amber-text" />
      </div>

      <div className="panel section-panel">
        <Table
          headers={['RANK', 'AGENT NAME', 'CODE', 'DEALS CLOSED', 'GROSS SALES', 'COLLECTED', 'COMMISSION', 'STATUS']}
          rows={agents.filter(a => a.join(' ').toLowerCase().includes(search.toLowerCase())).map((a, i) => [
            i + 1,
            <div className="customer-cell"><Avatar name={a[0]} i={i} /><b>{a[0]}</b></div>,
            a[1],
            a[2],
            `₹${a[3]}`,
            `₹${a[4]}`,
            `₹${a[5]}`,
            <Badge>Active</Badge>
          ])}
        />
      </div>
    </>
  );
}
