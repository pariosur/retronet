import {
  ArrowRight,
  CheckCircle,
  Github,
  MessageSquare,
  Target,
  Brain,
  Zap,
  Clock,
  Shield,
  Settings,
  BarChart,
  LayoutGrid,
} from "lucide-react";
import AppLayout from "./AppLayout";

function GuidePage({ onNavigate }) {
  return (
    <AppLayout onNavigate={onNavigate}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Welcome to retronet
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            AI-powered retrospective insights from your team's GitHub, Linear,
            and Slack data. Try it instantly with demo data, or connect your
            tools for real insights with GPT-5 analysis.
          </p>
        </div>

        {/* Quick Start Steps */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-600" />
            Quick Start Guide
          </h2>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Try it now:</strong> retronet starts with demo data
              enabled by default. You can explore the app immediately without
              setting up any integrations!
            </p>
          </div>

          <div className="space-y-6">
            <QuickStartStep
              number="1"
              title="Try Demo Mode (Ready Now!)"
              description="Explore retronet with sample team data to see how AI-powered insights work before connecting your tools."
              action="Open Dashboard"
              onClick={() => onNavigate("dashboard")}
              icon={<LayoutGrid className="w-5 h-5" />}
            />

            <QuickStartStep
              number="2"
              title="Connect Your Integrations"
              description="Set up your API keys for Linear, GitHub, Slack, and OpenAI to start analyzing your real team data."
              action="Go to Integrations"
              onClick={() => onNavigate("setup")}
              icon={<Settings className="w-5 h-5" />}
            />

            <QuickStartStep
              number="3"
              title="Generate Your First Retro"
              description="Select a date range and let GPT-5 analyze your team's activity to generate insights."
              action="Open Dashboard"
              onClick={() => onNavigate("dashboard")}
              icon={<LayoutGrid className="w-5 h-5" />}
            />

            <QuickStartStep
              number="3"
              title="Review & Save Insights"
              description="Explore the AI-generated insights and save your retrospectives for future reference."
              action="View Saved Retros"
              onClick={() => onNavigate("retros")}
              icon={<BarChart className="w-5 h-5" />}
            />
          </div>
        </div>

        {/* How It Works */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              How It Works
            </h3>
            <div className="space-y-4">
              <ProcessItem
                icon={<Target className="w-4 h-4 text-blue-600" />}
                title="Data Collection"
                description="Securely connects to your GitHub repos, Linear workspace, and Slack channels"
              />
              <ProcessItem
                icon={<Brain className="w-4 h-4 text-purple-600" />}
                title="AI Analysis"
                description="GPT-5 analyzes patterns, sentiment, and correlations across your team data"
              />
              <ProcessItem
                icon={<CheckCircle className="w-4 h-4 text-green-600" />}
                title="Insights Generation"
                description="Produces actionable insights for what went well, issues, and next steps"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              What You Need
            </h3>
            <div className="space-y-4">
              <RequirementItem
                icon={<Github className="w-4 h-4" />}
                title="GitHub Token"
                description="Personal access token to read repository activity and pull requests"
                required={true}
              />
              <RequirementItem
                icon={<Target className="w-4 h-4" />}
                title="Linear API Key"
                description="API key to access issues, projects, and team activity"
                required={true}
              />
              <RequirementItem
                icon={<MessageSquare className="w-4 h-4" />}
                title="Slack Bot Token"
                description="Bot token to analyze team communication patterns"
                required={false}
              />
              <RequirementItem
                icon={<Brain className="w-4 h-4" />}
                title="OpenAI API Key"
                description="API key for GPT-5 powered analysis and insights"
                required={true}
              />
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-8 mb-8">
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6 text-center">
            What retronet Analyzes
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Github className="w-6 h-6 text-gray-900" />}
              title="GitHub Activity"
              items={[
                "Commit patterns",
                "Pull request reviews",
                "Issue resolution",
                "Code quality metrics",
              ]}
            />
            <FeatureCard
              icon={<Target className="w-6 h-6 text-blue-600" />}
              title="Linear Progress"
              items={[
                "Issue completion",
                "Sprint velocity",
                "Blocker patterns",
                "Team workload",
              ]}
            />
            <FeatureCard
              icon={<MessageSquare className="w-6 h-6 text-green-600" />}
              title="Team Communication"
              items={[
                "Discussion sentiment",
                "Collaboration patterns",
                "Support requests",
                "Knowledge sharing",
              ]}
            />
          </div>
        </div>

        {/* Getting Started CTA */}
        <div className="text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Ready to Get Started?
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Set up your integrations and generate your first AI-powered
            retrospective in minutes.
          </p>
          <button
            onClick={() => onNavigate("setup")}
            className="bg-gray-900 dark:bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-black dark:hover:bg-gray-500 transition-colors flex items-center gap-2 mx-auto"
          >
            Start Setup
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

// Supporting Components
function QuickStartStep({ number, title, description, action, onClick, icon }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
      <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
          {icon}
          {title}
        </h4>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
          {description}
        </p>
        <button
          onClick={onClick}
          className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
        >
          {action}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function ProcessItem({ icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <h5 className="font-medium text-gray-900 dark:text-gray-100">
          {title}
        </h5>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function RequirementItem({ icon, title, description, required }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h5 className="font-medium text-gray-900 dark:text-gray-100">
            {title}
          </h5>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              required
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            }`}
          >
            {required ? "Required" : "Optional"}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, items }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h4>
      </div>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={index}
            className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2"
          >
            <div className="w-1 h-1 bg-gray-400 rounded-full flex-shrink-0"></div>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default GuidePage;
