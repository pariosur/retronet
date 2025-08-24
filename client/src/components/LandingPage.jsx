import { useState } from 'react';
import { Brain, Github, MessageSquare, Target, ArrowRight, Play, Zap, Shield, Clock } from 'lucide-react';

function LandingPage({ onStartDemo, onSetupTools }) {
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);

  const handleDemoClick = () => {
    setIsPlayingDemo(true);
    // Simulate demo loading
    setTimeout(() => {
      onStartDemo();
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium mb-6 animate-pulse">
            <Brain className="w-4 h-4" />
            AI-Powered Team Insights
          </div>
          
          {/* Main Headline */}
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Turn Your Team Data Into
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Actionable Insights
            </span>
          </h1>
          
          {/* Subtitle */}
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Connect GitHub, Linear, and Slack to get AI-powered retrospective insights. 
            Understand what's working, what isn't, and what to do next—automatically.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button 
              onClick={handleDemoClick}
              disabled={isPlayingDemo}
              className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:transform-none flex items-center gap-2"
            >
              {isPlayingDemo ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Loading Demo...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Try Live Demo
                </>
              )}
            </button>
            <button 
              onClick={onSetupTools}
              className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              Connect Your Tools
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="flex items-center justify-center gap-8 text-sm text-gray-500 mb-16">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Privacy First
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              2-Minute Setup
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Instant Insights
            </div>
          </div>
        </div>
        
        {/* Live Preview Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-16 border border-gray-100">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">See It In Action</h2>
            <p className="text-gray-600">Real insights from a sample team sprint</p>
          </div>
          
          {/* Sample Insights Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            <InsightPreviewCard 
              emoji="🚀" 
              title="What Went Well" 
              count={4}
              preview="Fast incident response on webhook issues with 2-hour resolution time"
              color="green"
              badge="AI Generated"
            />
            <InsightPreviewCard 
              emoji="⚠️" 
              title="Needs Attention" 
              count={3}
              preview="Code review bottleneck causing 40% longer PR cycle times"
              color="yellow"
              badge="Pattern Detected"
            />
            <InsightPreviewCard 
              emoji="🎯" 
              title="Action Items" 
              count={6}
              preview="Implement pair programming for critical fixes to reduce bugs by 60%"
              color="blue"
              badge="Recommended"
            />
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-600 text-lg">Three simple steps to better retrospectives</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <ProcessStep 
              number="1"
              icon={<Target className="w-8 h-8" />}
              title="Connect Your Tools"
              description="Link GitHub, Linear, and Slack with secure API tokens. Takes 2 minutes."
              features={["GitHub commits & PRs", "Linear issues & projects", "Slack team discussions"]}
            />
            <ProcessStep 
              number="2"
              icon={<Brain className="w-8 h-8" />}
              title="AI Analysis"
              description="Our AI analyzes patterns across your team data to find meaningful insights."
              features={["Cross-platform correlation", "Sentiment analysis", "Pattern recognition"]}
            />
            <ProcessStep 
              number="3"
              icon={<Zap className="w-8 h-8" />}
              title="Get Insights"
              description="Receive detailed, actionable insights ready for your next retrospective."
              features={["What went well", "Areas for improvement", "Specific action items"]}
            />
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Teams Love It</h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Brain className="w-6 h-6" />}
              title="AI-Powered Analysis"
              description="Get insights that humans might miss by analyzing patterns across all your tools"
            />
            <FeatureCard 
              icon={<Shield className="w-6 h-6" />}
              title="Privacy Focused"
              description="Your data stays secure. Optional privacy mode sanitizes sensitive information"
            />
            <FeatureCard 
              icon={<Clock className="w-6 h-6" />}
              title="Save Hours"
              description="No more manual data gathering. Get comprehensive insights in minutes, not hours"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Supporting Components
function InsightPreviewCard({ emoji, title, count, preview, color, badge }) {
  const colorClasses = {
    green: "border-green-200 bg-green-50",
    yellow: "border-yellow-200 bg-yellow-50", 
    blue: "border-blue-200 bg-blue-50"
  };

  const badgeClasses = {
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    blue: "bg-blue-100 text-blue-800"
  };

  return (
    <div className={`p-6 rounded-xl border-2 ${colorClasses[color]} hover:shadow-lg transition-all cursor-pointer group`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <span className="text-sm text-gray-600">{count} insights</span>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeClasses[color]}`}>
          {badge}
        </span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed group-hover:text-gray-900 transition-colors">
        {preview}
      </p>
    </div>
  );
}

function ProcessStep({ number, icon, title, description, features }) {
  return (
    <div className="text-center group">
      <div className="relative mb-6">
        <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-700 transition-colors">
          {icon}
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
          {number}
        </div>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 mb-4 leading-relaxed">{description}</p>
      <ul className="text-sm text-gray-500 space-y-1">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
      <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

export default LandingPage;