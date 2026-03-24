/**
 * PersonSearch Component
 * ======================
 * Design: Corporate Precision - Clean search with dropdown results
 * Searches by name or cedula with debounced input
 */

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { buscarPersonas, type Persona } from '@/lib/supabase';
import { Search, User, X } from 'lucide-react';

interface PersonSearchProps {
  onSelect: (persona: Persona) => void;
  onClear: () => void;
  selectedPersona: Persona | null;
}

export default function PersonSearch({ onSelect, onClear, selectedPersona }: PersonSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Persona[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await buscarPersonas(query);
        setResults(data);
        setIsOpen(data.length > 0);
      } catch (err) {
        console.error('Error searching:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  const handleSelect = (persona: Persona) => {
    onSelect(persona);
    setQuery('');
    setIsOpen(false);
  };

  if (selectedPersona) {
    return (
      <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {selectedPersona.nombre_completo}
          </p>
          <p className="text-xs text-muted-foreground font-mono-numbers">
            {selectedPersona.cedula} DV{selectedPersona.dv}
          </p>
        </div>
        <button
          onClick={onClear}
          className="p-1.5 rounded-md hover:bg-gray-200/60 transition-colors"
          title="Cambiar persona"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o cédula..."
          className="pl-9 h-11 text-sm bg-white"
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((persona) => (
            <button
              key={persona.id}
              onClick={() => handleSelect(persona)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {persona.nombre_completo}
                </p>
                <p className="text-xs text-gray-500 font-mono-numbers">
                  {persona.cedula} · {persona.nombre_banco}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && !isLoading && results.length === 0 && isOpen === false && (
        <p className="text-xs text-muted-foreground mt-1.5 ml-1">
          No se encontraron resultados. Puede registrar una nueva persona abajo.
        </p>
      )}
    </div>
  );
}
