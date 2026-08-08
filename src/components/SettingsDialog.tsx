"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function SettingsDialog() {
  const [exchange, setExchange] = useState("binance");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadKeys() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase.from('exchange_keys')
        .select('*')
        .eq('user_id', user.id)
        .eq('exchange', exchange)
        .single();
        
      if (data) {
        setApiKey(data.api_key);
        setApiSecret(data.api_secret); // in a real app, don't return the secret to the frontend, just show '***'
        setPassphrase(data.api_passphrase || "");
      } else {
        setApiKey("");
        setApiSecret("");
        setPassphrase("");
      }
    }
    loadKeys();
  }, [exchange]);

  const handleSave = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error } = await supabase.from('exchange_keys').upsert({
        user_id: user.id,
        exchange: exchange,
        api_key: apiKey,
        api_secret: apiSecret,
        api_passphrase: passphrase,
      }, { onConflict: 'user_id, exchange' });

      if (error) throw error;
      toast.success(`${exchange.toUpperCase()} API Keys saved securely.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save API keys");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger 
        render={
          <Button variant="outline" size="icon" className="bg-zinc-900 border-zinc-800 text-zinc-400">
            <Settings className="w-4 h-4" />
          </Button>
        } 
      />
      <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-200">
        <DialogHeader>
          <DialogTitle>Exchange Integrations</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Exchange</Label>
            <Select value={exchange} onValueChange={(val: string | null) => { if (val) setExchange(val); }}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200">
                <SelectValue placeholder="Select Exchange" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                <SelectItem value="binance">Binance / Binance US</SelectItem>
                <SelectItem value="coinbase">Coinbase Advanced Trade</SelectItem>
              </SelectContent>
            </Select>
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
          {exchange === "coinbase" && (
             <div className="grid gap-2">
               <Label>Passphrase (Optional)</Label>
               <Input 
                 type="password"
                 value={passphrase} 
                 onChange={e => setPassphrase(e.target.value)} 
                 className="bg-zinc-900 border-zinc-800 text-zinc-200"
               />
             </div>
          )}
        </div>
        <Button onClick={handleSave} disabled={isLoading} className="w-full bg-purple-600 hover:bg-purple-700">
          {isLoading ? "Saving..." : "Save API Keys"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
