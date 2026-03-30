/**
 * ColaboradoresManager — Manage active/inactive eventuales
 * Shows all registered persons with toggle for active status
 * and department assignment. Inactive eventuales stay registered
 * but won't appear in the automatic payment list.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  obtenerTodosColaboradores,
  toggleColaboradorActivo,
  actualizarDepartamentoPrincipal,
  obtenerTarifas,
  type Persona,
  type TarifaDepartamento,
} from '@/lib/supabase';
import {
  Loader2,
  UserCheck,
  UserX,
  Search,
  Users,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onColaboradoresChanged?: () => void;
}

export default function ColaboradoresManager({ onColaboradoresChanged }: Props) {
  const [colaboradores, setColaboradores] = useState<Persona[]>([]);
  const [tarifas, setTarifas] = useState<TarifaDepartamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showTab, setShowTab] = useState<'activos' | 'inactivos'>('activos');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cols, tars] = await Promise.all([
        obtenerTodosColaboradores(),
        obtenerTarifas(),
      ]);
      setColaboradores(cols);
      setTarifas(tars);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar eventuales');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActivo(persona: Persona) {
    if (!persona.id) return;
    const newState = !persona.activo;
    setTogglingId(persona.id);
    try {
      await toggleColaboradorActivo(persona.id, newState);
      setColaboradores((prev) =>
        prev.map((c) => (c.id === persona.id ? { ...c, activo: newState } : c))
      );
      toast.success(
        newState
          ? `${persona.nombre_completo} activado`
          : `${persona.nombre_completo} desactivado`
      );
      onColaboradoresChanged?.();
    } catch (err: any) {
      toast.error('Error: ' + (err?.message || ''));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDeptChange(persona: Persona, dept: string) {
    if (!persona.id) return;
    try {
      await actualizarDepartamentoPrincipal(persona.id, dept);
      setColaboradores((prev) =>
        prev.map((c) => (c.id === persona.id ? { ...c, departamento_principal: dept } : c))
      );
      toast.success(`Departamento actualizado para ${persona.nombre_completo}`);
    } catch (err: any) {
      toast.error('Error: ' + (err?.message || ''));
    }
  }

  const activos = colaboradores.filter((c) => c.activo !== false);
  const inactivos = colaboradores.filter((c) => c.activo === false);
  const displayList = showTab === 'activos' ? activos : inactivos;

  const filtered = filter.trim()
    ? displayList.filter(
        (c) =>
          c.nombre_completo.toLowerCase().includes(filter.toLowerCase()) ||
          c.cedula.includes(filter)
      )
    : displayList;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1B4965' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg border" style={{ borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }}>
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" style={{ color: '#16a34a' }} />
            <span className="text-xs font-medium" style={{ color: '#15803d' }}>Activos</span>
          </div>
          <p className="text-2xl font-bold font-mono mt-1" style={{ color: '#166534' }}>{activos.length}</p>
        </div>
        <div className="p-3 rounded-lg border" style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2' }}>
          <div className="flex items-center gap-2">
            <UserX className="w-4 h-4" style={{ color: '#dc2626' }} />
            <span className="text-xs font-medium" style={{ color: '#b91c1c' }}>Inactivos</span>
          </div>
          <p className="text-2xl font-bold font-mono mt-1" style={{ color: '#991b1b' }}>{inactivos.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: '#f3f4f6' }}>
        <button
          onClick={() => setShowTab('activos')}
          className="flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all"
          style={{
            backgroundColor: showTab === 'activos' ? '#ffffff' : 'transparent',
            color: showTab === 'activos' ? '#111827' : '#6b7280',
            boxShadow: showTab === 'activos' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <UserCheck className="w-3.5 h-3.5 inline mr-1.5" />
          Activos ({activos.length})
        </button>
        <button
          onClick={() => setShowTab('inactivos')}
          className="flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all"
          style={{
            backgroundColor: showTab === 'inactivos' ? '#ffffff' : 'transparent',
            color: showTab === 'inactivos' ? '#111827' : '#6b7280',
            boxShadow: showTab === 'inactivos' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <UserX className="w-3.5 h-3.5 inline mr-1.5" />
          Inactivos ({inactivos.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por nombre o cédula..."
          className="pl-9 h-9 text-sm bg-white"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-10 h-10 mx-auto mb-2" style={{ color: '#d1d5db' }} />
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            {filter ? 'No se encontraron resultados' : `No hay eventuales ${showTab}`}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((persona) => (
            <div
              key={persona.id}
              className="flex items-center gap-3 p-3 rounded-lg border transition-all hover:shadow-sm"
              style={{
                borderColor: persona.activo !== false ? '#d1fae5' : '#e5e7eb',
                backgroundColor: persona.activo !== false ? '#ffffff' : '#fafafa',
              }}
            >
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{
                  backgroundColor: persona.activo !== false ? '#dbeafe' : '#f3f4f6',
                  color: persona.activo !== false ? '#1e40af' : '#9ca3af',
                }}
              >
                {persona.nombre_completo.charAt(0)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#111827' }}>
                  {persona.nombre_completo}
                </p>
                <p className="text-xs font-mono" style={{ color: '#6b7280' }}>
                  {persona.cedula} · {persona.nombre_banco}
                </p>
              </div>

              {/* Department */}
              <div className="flex-shrink-0 w-36">
                <Select
                  value={persona.departamento_principal || ''}
                  onValueChange={(val) => handleDeptChange(persona, val)}
                >
                  <SelectTrigger className="h-8 text-[11px] bg-white">
                    <Building2 className="w-3 h-3 mr-1 flex-shrink-0" style={{ color: '#9ca3af' }} />
                    <SelectValue placeholder="Dept..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tarifas.map((t) => (
                      <SelectItem key={t.clave} value={t.clave} className="text-xs">
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggle */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5 flex-shrink-0"
                style={{
                  color: persona.activo !== false ? '#dc2626' : '#16a34a',
                  backgroundColor: persona.activo !== false ? '#fef2f2' : '#f0fdf4',
                }}
                onClick={() => handleToggleActivo(persona)}
                disabled={togglingId === persona.id}
              >
                {togglingId === persona.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : persona.activo !== false ? (
                  <>
                    <UserX className="w-3 h-3" /> Desactivar
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3 h-3" /> Activar
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
