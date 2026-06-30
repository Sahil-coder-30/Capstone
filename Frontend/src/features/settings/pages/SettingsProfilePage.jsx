import React, { useState, useEffect } from 'react';
import { 
  User, Save, Trash2, LogOut, ShieldAlert, 
  Code2, Link, Globe, MapPin, Briefcase, Calendar, Award
} from 'lucide-react';

export default function SettingsProfilePage({ 
  user, 
  userName, 
  userInitials, 
  userPhoto, 
  profile,
  onUpdateProfile,
  onLogout 
}) {
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [twitter, setTwitter] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [skillsStr, setSkillsStr] = useState('');
  const [experienceYears, setExperienceYears] = useState(0);

  // Sync state with profile loaded from Redux
  useEffect(() => {
    if (profile) {
      setLinkedin(profile.linkedin || '');
      setGithub(profile.github || '');
      setTwitter(profile.twitter || '');
      setWebsite(profile.website || '');
      setBio(profile.bio || '');
      setLocation(profile.location || '');
      setCompany(profile.company || '');
      setJobTitle(profile.jobTitle || '');
      setSkillsStr(profile.skills?.join(', ') || '');
      setExperienceYears(profile.experienceYears || 0);
    }
  }, [profile]);

  const handleSaveProfile = (e) => {
    e.preventDefault();

    // Format skills string to array of clean trimmed strings
    const skillsArray = skillsStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    onUpdateProfile({
      linkedin,
      github,
      twitter,
      website,
      bio,
      location,
      company,
      jobTitle,
      skills: skillsArray,
      experienceYears: Number(experienceYears)
    })
      .then(() => alert('Profile successfully updated.'))
      .catch((err) => alert(err || 'Failed to update profile.'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: 'var(--font-sans)', paddingBottom: '32px' }}>
      
      {/* 1. Profile Header Card */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(28,31,48,0.2) 100%)', 
        padding: '28px', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        {userPhoto ? (
          <img src={userPhoto} alt={userName} style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid var(--primary)', boxShadow: '0 0 10px var(--primary-glow)' }} />
        ) : (
          <div style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '50%', 
            backgroundColor: 'var(--bg-element)', 
            border: '2px solid var(--primary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '28px', 
            fontWeight: '800', 
            color: 'var(--primary)',
            boxShadow: '0 0 10px var(--primary-glow)'
          }}>
            {userInitials}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>{userName}</h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-dark)', marginTop: '4px', margin: '4px 0 0' }}>{user?.email || 'developer@example.com'}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              fontSize: '10px', 
              fontWeight: '800', 
              color: 'var(--primary)', 
              background: 'var(--brand-subtle)', 
              padding: '3px 10px', 
              borderRadius: '20px', 
              border: '1px solid var(--primary-glow)',
              letterSpacing: '0.05em'
            }}>
              FREE DEV PLAN
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Profile Settings Form */}
      <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Core Profile Card */}
        <div style={{ 
          background: 'var(--bg-surface)', 
          padding: '28px', 
          borderRadius: '12px', 
          border: '1px solid var(--border)', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
            <User size={16} color="var(--primary)" /> Professional Profile
          </h3>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Job Title</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Briefcase size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="text" 
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>

            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Company / Organization</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Briefcase size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="text" 
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Google, Stripe"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Location</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <MapPin size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="text" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>

            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Years of Experience</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Calendar size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="number" 
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  placeholder="e.g. 5"
                  min="0"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Short Bio</label>
            <textarea 
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
              style={{ 
                padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', 
                backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', resize: 'none', 
                fontFamily: 'inherit', lineHeight: '1.5', transition: 'border-color 0.2s'
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Core Skills (comma separated)</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Award size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
              <input 
                type="text" 
                value={skillsStr}
                onChange={(e) => setSkillsStr(e.target.value)}
                placeholder="React, Node.js, TypeScript, Kubernetes"
                style={{ 
                  width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                  backgroundColor: 'var(--bg-canvas)', color: '#fff', fontSize: '13.5px', transition: 'border-color 0.2s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>
            {profile?.skills?.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                {profile.skills.map((skill, idx) => (
                  <span key={idx} style={{ 
                    fontSize: '11px', background: 'var(--bg-canvas)', color: 'var(--text-dark)', 
                    padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)' 
                  }}>
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Social Integration Links Card */}
        <div style={{ 
          background: 'var(--bg-surface)', 
          padding: '28px', 
          borderRadius: '12px', 
          border: '1px solid var(--border)', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
            <Globe size={16} color="var(--primary)" /> Social Integrations & Links
          </h3>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* GitHub */}
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>GitHub Profile</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Code2 size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="text" 
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  placeholder="https://github.com/username"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>

            {/* LinkedIn */}
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>LinkedIn Profile</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Link size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="text" 
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* Twitter/X */}
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Twitter / X Profile</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Link size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="text" 
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="https://twitter.com/username"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>

            {/* Personal Website */}
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Website / Portfolio</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Globe size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-dark)' }} />
                <input 
                  type="text" 
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourportfolio.dev"
                  style={{ 
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', 
                    backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: '13.5px', transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>
          </div>
        </div>

        <button 
          type="submit"
          className="btn-primary" 
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', padding: '10px 20px' }}
        >
          <Save size={14} /> Save Profile Changes
        </button>
      </form>

      {/* 3. Danger Zone */}
      <div style={{ 
        background: 'var(--bg-surface)', 
        border: '1px solid rgba(239,68,68,0.15)', 
        padding: '28px', 
        borderRadius: '12px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--error)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={16} /> Danger Zone
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark)', margin: 0, lineHeight: '1.6' }}>
          Permanently delete your developer account and remove all active containers, API secrets, and cloud configurations. This process is irreversible.
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => { if(confirm('Delete account?')) alert('Simulating account deletion.'); }} 
            className="btn-danger" 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '10px 16px',
              backgroundColor: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: '7px', cursor: 'pointer', fontWeight: '600'
            }}
          >
            <Trash2 size={13} /> Delete Developer Account
          </button>
          
          <button 
            onClick={onLogout} 
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '10px 16px' }}
          >
            <LogOut size={13} /> Log Out Session
          </button>
        </div>
      </div>
    </div>
  );
}
