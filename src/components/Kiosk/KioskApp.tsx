'use client';

import React, { useState, useRef, useEffect } from 'react';
import SignaturePad from 'signature_pad';

export default function KioskApp() {
    const [searchName, setSearchName] = useState('');
    const [activeProfile, setActiveProfile] = useState<{name: string, dept: string, isClinician: boolean} | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sigPad = useRef<any>(null);
    const [screen, setScreen] = useState<'HOME' | 'SIGNATURE' | 'THANK_YOU'>('HOME');

    useEffect(() => {
        if (screen === 'SIGNATURE' && canvasRef.current) {
            // Setup Signature Canvas exactly mimicking HTML
            const canvas = canvasRef.current;
            sigPad.current = new SignaturePad(canvas, {
                minWidth: 1.5,
                maxWidth: 4.5,
                penColor: "rgb(15, 30, 45)"
            });

            const resizeCanvas = () => {
                const ratio = Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                canvas.getContext("2d")?.scale(ratio, ratio);
                sigPad.current?.clear(); 
            };
            window.addEventListener("resize", resizeCanvas);
            resizeCanvas();

            return () => window.removeEventListener("resize", resizeCanvas);
        }
    }, [screen]);

    const handleSearchCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchName(val);
    };

    const attemptLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchName.trim().length > 3) {
            // Emulate an automatic matched clinician selection based on regex rules from Python Script
            const isClin = /\b(MD|D\.O\.|DO|MBBS|PHYSICIAN|CLINICIAN|SURGEON)\b/i.test(searchName);
            setActiveProfile({
                name: searchName.trim(),
                dept: "Office of Faculty Development",
                isClinician: isClin
            });
            setScreen('SIGNATURE');
        } else {
            alert("Please type a valid full name to continue.");
        }
    };

    const submitSignature = () => {
        if (sigPad.current && sigPad.current.isEmpty() && activeProfile?.isClinician) {
            alert("As a clinician, a valid signature is required for CME accreditation.");
            return;
        }

        const trace = sigPad.current ? sigPad.current.toData() : [];
        console.log("Submitting DTW Machine Learning Trace Payload:", trace);

        setScreen('THANK_YOU');
        setTimeout(() => {
            setSearchName('');
            setActiveProfile(null);
            setScreen('HOME');
        }, 2000);
    };

    return (
        <div className="w-full bg-white/90 backdrop-blur-md rounded-2xl border border-white/40 shadow-2xl p-10 flex flex-col items-center">
            
            {screen === 'HOME' && (
                <div className="w-full max-w-lg text-center animate-in fade-in zoom-in duration-300">
                    <h2 className="text-4xl font-bold text-[#097C87] mb-2 font-serif">Welcome</h2>
                    <p className="text-lg text-slate-500 mb-8 font-medium">Type your name to confidently sign-in via the Identity Matrix.</p>
                    <form onSubmit={attemptLogin} className="w-full relative">
                        <input 
                            value={searchName}
                            onChange={handleSearchCheck}
                            placeholder="Enter First or Last Name..." 
                            className="w-full p-5 text-xl text-slate-800 border-2 border-slate-300 rounded-xl mb-6 bg-white focus:outline-none focus:border-[#097C87] focus:ring-4 focus:ring-[#097C87]/20 transition-all font-semibold shadow-inner"
                        />
                        <button type="submit" className="w-full bg-gradient-to-r from-[#097C87] to-[#23CED9] text-white font-bold text-xl py-5 rounded-xl shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all hov active:scale-95">
                            Locate Profile
                        </button>
                    </form>
                    <p className="text-sm text-slate-400 mt-6 tracking-wide">Need help? Please see the registration desk or an OFD representative.</p>
                </div>
            )}

            {screen === 'SIGNATURE' && activeProfile && (
                <div className="w-full max-w-3xl animate-in slide-in-from-right-8 duration-300">
                    <h2 className="text-3xl font-bold text-slate-800 mb-2">Confirm Attendance</h2>
                    <p className="text-xl text-slate-600 mb-1">
                        Signing in: <strong className="text-[#097C87]">{activeProfile.name}</strong> <span className="text-sm">({activeProfile.dept})</span>
                    </p>
                    <div className="mb-4">
                        {activeProfile.isClinician ? 
                            <span className="text-red-500 font-bold text-sm tracking-wide">* Valid Legal Signature Required for CME Credit Audit</span> : 
                            <span className="text-slate-500 text-sm tracking-wide">(Signature Optional for Non-Clinicians)</span>
                        }
                    </div>

                    <div className="w-full border-[3px] border-dashed border-slate-400 rounded-xl p-1 bg-white mb-6 relative">
                        <canvas ref={canvasRef} className="w-full h-[320px] rounded-lg cursor-crosshair touch-none"></canvas>
                        <div className="absolute bottom-4 left-4 text-slate-300 flex select-none pointer-events-none items-center font-bold text-2xl uppercase tracking-widest gap-4 px-4 h-full w-full justify-center rotate-[-10deg] opacity-20">
                            SIGN HERE - X_________________________
                        </div>
                    </div>

                    <div className="flex justify-between w-full mt-4 flex-wrap gap-4">
                        <button 
                            type="button"
                            onClick={() => sigPad.current?.clear()}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition-colors"
                        >
                            Clear Signature Array
                        </button>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setScreen('HOME')}
                                className="bg-transparent hover:bg-slate-100 text-slate-500 font-bold py-3 px-6 rounded-lg transition-colors border border-transparent hover:border-slate-300"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={submitSignature}
                                className="bg-[#097C87] hover:bg-[#065e68] text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 active:scale-95 text-lg"
                            >
                                Submit Registration
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {screen === 'THANK_YOU' && (
                <div className="w-full max-w-lg text-center animate-in zoom-in duration-300 text-[#097C87]">
                    <div className="text-8xl mb-6">✅</div>
                    <h2 className="text-4xl font-black mb-4">Registration Locked!</h2>
                    <p className="text-xl text-slate-600 font-medium">Thank you. Please pass the device to the next person.</p>
                </div>
            )}
            
        </div>
    );
}
