"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Plus, Trash2, Play, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ExchangeConnection } from "@/lib/types";
import { useTradingStore } from "@/store/useTradingStore";
import { ExchangeRegistry, getProviderById, ExchangeProvider } from "@/lib/providers/exchanges/registry";

export function SettingsDialog() {
  const [connections, setConnections] = useState<ExchangeConnection[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [exchangeId, setExchangeId] = useState<string>("binance");
  const [environment, setEnvironment] = useState<"mainnet" | "testnet">("testnet");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingId, setIsTestingId] = useState<string | null>(null);
  
  const supabase = createClient();
  const setActiveConnectionId = useTradingStore((state) => state.setActiveConnectionId);

  useEffect(() => {
    loadConnections();
  }, []);

  async function loadConnections() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase.from('exchange_keys')
      .select('id, user_id, exchange, environment, is_active, permissions, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
      
    if (data) {
      setConnections(data as ExchangeConnection[]);
      const activeConn = (data as ExchangeConnection[]).find(c => c.is_active);
      setActiveConnectionId(activeConn ? activeConn.id : null);
    }
  }

  const handleSave = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        user_id: user.id,
        exchange: exchangeId,
        environment,
        api_key: apiKey,
        api_secret: apiSecret,
        api_passphrase: passphrase,
      };

      if (editingId) {
        const { error } = await supabase.from('exchange_keys').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success(`Connection updated successfully.`);
      } else {
        const { error } = await supabase.from('exchange_keys').insert(payload);
        if (error) throw error;
        toast.success(`Connection added securely.`);
      }
      
      resetForm();
      await loadConnections();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err.message || "Failed to save API keys");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this connection permanently?")) return;
    const { error } = await supabase.from('exchange_keys').delete().eq('id', id);
    if (error) {
      toast.error("Failed to delete connection.");
    } else {
      toast.success("Connection deleted.");
      await loadConnections();
    }
  };

  const handleSetActive = async (id: string | null) => {
    try {
      const res = await fetch("/api/exchanges/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id })
      });
      if (!res.ok) throw new Error("Failed to update active connection");
      await loadConnections();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTest = async (id: string) => {
    setIsTestingId(id);
    try {
      const res = await fetch("/api/exchanges/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      toast.success(data.message || "Connection successful");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsTestingId(null);
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setExchangeId("binance");
    setEnvironment("testnet");
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
  };

  const selectedProvider: ExchangeProvider | undefined = getProviderById(exchangeId);

  return (
    <Dialog>
      <DialogTrigger 
        render={
          <Button variant="outline" size="icon" className="bg-zinc-900 border-zinc-800 text-zinc-400">
            <Settings className="w-4 h-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-200">
        <DialogHeader>
          <DialogTitle>Exchange Connections</DialogTitle>
        </DialogHeader>

        {!isAdding && !editingId ? (
          <div className="grid gap-4 py-4">
            {connections.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">No connections saved.</p>
            ) : (
              connections.map(conn => {
                const provider = getProviderById(conn.exchange);
                return (
                  <div key={conn.id} className="flex flex-col gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-md">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-sm text-white capitalize">{provider ? provider.name : conn.exchange}</h3>
                        <p className="text-xs text-zinc-400 capitalize">{conn.environment}</p>
                      </div>
                      {conn.is_active && (
                        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {conn.is_active ? (
                        <Button 
                          size="sm" 
                          variant="secondary"
                          className="h-7 text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                          onClick={() => handleSetActive(null)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="default"
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => handleSetActive(conn.id)}
                        >
                          Use
                        </Button>
                      )}
                      
                      <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent border-zinc-700 text-zinc-300" onClick={() => handleTest(conn.id)} disabled={isTestingId === conn.id}>
                        <Play className="w-3 h-3 mr-1" /> {isTestingId === conn.id ? "Testing..." : "Test"}
                      </Button>
                      <div className="flex-1"></div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => handleDelete(conn.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
            
            <Button onClick={() => setIsAdding(true)} variant="outline" className="w-full mt-2 border-dashed border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Exchange
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Exchange ID (e.g., binance, kraken)</Label>
              <Input 
                value={exchangeId} 
                onChange={(e) => setExchangeId(e.target.value.toLowerCase())}
                className="bg-zinc-900 border-zinc-800 text-zinc-200"
                placeholder="Exchange ID for CCXT"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Environment (mainnet or testnet)</Label>
              <Input 
                value={environment} 
                onChange={(e) => setEnvironment(e.target.value as "mainnet" | "testnet")}
                className="bg-zinc-900 border-zinc-800 text-zinc-200"
                placeholder="mainnet or testnet"
              />
            </div>

            <div className="grid gap-2">
              <Label>API Key</Label>
              <Input 
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)} 
                className="bg-zinc-900 border-zinc-800 text-zinc-200"
                placeholder="Public API Key"
              />
            </div>

            <div className="grid gap-2">
              <Label>API Secret</Label>
              <Input 
                type="password"
                value={apiSecret} 
                onChange={e => setApiSecret(e.target.value)} 
                className="bg-zinc-900 border-zinc-800 text-zinc-200"
                placeholder="Secret Key"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Passphrase (Optional)</Label>
              <Input 
                type="password"
                value={passphrase} 
                onChange={e => setPassphrase(e.target.value)} 
                className="bg-zinc-900 border-zinc-800 text-zinc-200"
                placeholder="Passphrase (if required by exchange)"
              />
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button onClick={resetForm} variant="outline" className="flex-1 bg-transparent border-zinc-700 text-zinc-300">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading} className="flex-1 bg-purple-600 hover:bg-purple-700">
                {isLoading ? "Saving..." : "Save Connection"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
