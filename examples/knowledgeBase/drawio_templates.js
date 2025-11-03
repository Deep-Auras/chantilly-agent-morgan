/**
 * Professional Draw.io XML Templates for Knowledge Base
 * These examples will be added to knowledge base with 'drawio' tags
 */

const professionalFlowchart = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Chantilly" modified="2025-10-06T00:00:00.000Z" agent="Chantilly Agent" version="21.6.5" type="device">
  <diagram name="Professional Process Flow" id="professional-flowchart">
    <mxGraphModel dx="1422" dy="794" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" background="#ffffff" math="0" shadow="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- Start: Modern Gradient Style -->
        <mxCell id="start" value="Start Process" style="ellipse;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontFamily=Segoe UI;fontSize=14;fontStyle=1;gradientColor=#d5b4f0;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="150" y="50" width="120" height="60" as="geometry" />
        </mxCell>
        
        <!-- Input: Rounded Rectangle with Icon Style -->
        <mxCell id="input1" value="📊 Collect Data" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontFamily=Segoe UI;fontSize=12;spacing=10;spacingLeft=15;gradientColor=#b3d9ff;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="130" y="160" width="160" height="70" as="geometry" />
        </mxCell>
        
        <!-- Process: Modern Card Style -->
        <mxCell id="process1" value="🔄 Analyze Information&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 10px;&quot;&gt;Apply business rules and&lt;br&gt;validate data integrity&lt;/font&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontFamily=Segoe UI;fontSize=12;align=center;verticalAlign=top;spacing=10;spacingTop=15;gradientColor=#fffacd;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="110" y="280" width="200" height="90" as="geometry" />
        </mxCell>
        
        <!-- Decision: Diamond with Gradient -->
        <mxCell id="decision1" value="✅ Valid?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontFamily=Segoe UI;fontSize=13;fontStyle=1;gradientColor=#ffb3ba;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="160" y="420" width="100" height="80" as="geometry" />
        </mxCell>
        
        <!-- Success Path -->
        <mxCell id="success" value="✨ Generate Report" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontFamily=Segoe UI;fontSize=12;gradientColor=#b3e6b3;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="350" y="430" width="140" height="60" as="geometry" />
        </mxCell>
        
        <!-- Error Handling -->
        <mxCell id="error" value="⚠️ Handle Error&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 10px;&quot;&gt;Log issue and&lt;br&gt;notify administrator&lt;/font&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6e6;strokeColor=#cc0000;fontFamily=Segoe UI;fontSize=11;align=center;verticalAlign=top;spacing=10;spacingTop=12;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="30" y="550" width="130" height="80" as="geometry" />
        </mxCell>
        
        <!-- End -->
        <mxCell id="end" value="Complete" style="ellipse;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontFamily=Segoe UI;fontSize=14;fontStyle=1;gradientColor=#d5b4f0;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="360" y="560" width="120" height="60" as="geometry" />
        </mxCell>
        
        <!-- Modern Connectors with Labels -->
        <mxCell id="edge1" value="" edge="1" source="start" target="input1" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#666666;endArrow=classic;endFill=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="edge2" value="" edge="1" source="input1" target="process1" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#666666;endArrow=classic;endFill=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="edge3" value="" edge="1" source="process1" target="decision1" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#666666;endArrow=classic;endFill=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="edge4" value="Yes" edge="1" source="decision1" target="success" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#82b366;endArrow=classic;endFill=1;fontFamily=Segoe UI;fontSize=11;fontStyle=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="edge5" value="No" edge="1" source="decision1" target="error" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#cc0000;endArrow=classic;endFill=1;fontFamily=Segoe UI;fontSize=11;fontStyle=1;">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="210" y="520" />
              <mxPoint x="95" y="520" />
            </Array>
          </mxGeometry>
        </mxCell>
        
        <mxCell id="edge6" value="Retry" edge="1" source="error" target="input1" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#ff9900;endArrow=classic;endFill=1;fontFamily=Segoe UI;fontSize=11;fontStyle=1;dashed=1;">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="50" y="195" />
            </Array>
          </mxGeometry>
        </mxCell>
        
        <mxCell id="edge7" value="" edge="1" source="success" target="end" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#82b366;endArrow=classic;endFill=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const creativeMindmap = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Chantilly" modified="2025-10-06T00:00:00.000Z" agent="Chantilly Agent" version="21.6.5" type="device">
  <diagram name="Creative Mind Map" id="creative-mindmap">
    <mxGraphModel dx="1422" dy="794" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" background="#f8f9fa" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- Central Topic: Large, Vibrant -->
        <mxCell id="center" value="🎯 PROJECT GOALS" style="ellipse;whiteSpace=wrap;html=1;fillColor=#ff6b6b;strokeColor=#ffffff;fontFamily=Arial Black;fontSize=16;fontStyle=1;fontColor=#ffffff;shadow=1;strokeWidth=3;" vertex="1" parent="1">
          <mxGeometry x="300" y="350" width="200" height="100" as="geometry" />
        </mxCell>
        
        <!-- Branch 1: Strategy (Top) -->
        <mxCell id="strategy" value="📋 STRATEGY" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#4ecdc4;strokeColor=#ffffff;fontFamily=Arial;fontSize=14;fontStyle=1;fontColor=#ffffff;shadow=1;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="350" y="150" width="100" height="60" as="geometry" />
        </mxCell>
        
        <mxCell id="planning" value="Planning" style="ellipse;whiteSpace=wrap;html=1;fillColor=#a8e6cf;strokeColor=#4ecdc4;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="250" y="80" width="80" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="research" value="Research" style="ellipse;whiteSpace=wrap;html=1;fillColor=#a8e6cf;strokeColor=#4ecdc4;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="450" y="80" width="80" height="50" as="geometry" />
        </mxCell>
        
        <!-- Branch 2: Execution (Right) -->
        <mxCell id="execution" value="⚡ EXECUTION" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#feca57;strokeColor=#ffffff;fontFamily=Arial;fontSize=14;fontStyle=1;fontColor=#2c3e50;shadow=1;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="600" y="370" width="100" height="60" as="geometry" />
        </mxCell>
        
        <mxCell id="development" value="Development" style="ellipse;whiteSpace=wrap;html=1;fillColor=#ffe4b5;strokeColor=#feca57;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="720" y="300" width="90" height="55" as="geometry" />
        </mxCell>
        
        <mxCell id="testing" value="Testing" style="ellipse;whiteSpace=wrap;html=1;fillColor=#ffe4b5;strokeColor=#feca57;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="720" y="420" width="80" height="50" as="geometry" />
        </mxCell>
        
        <!-- Branch 3: Team (Bottom) -->
        <mxCell id="team" value="👥 TEAM" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ff9ff3;strokeColor=#ffffff;fontFamily=Arial;fontSize=14;fontStyle=1;fontColor=#2c3e50;shadow=1;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="350" y="550" width="100" height="60" as="geometry" />
        </mxCell>
        
        <mxCell id="communication" value="Communication" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8d7da;strokeColor=#ff9ff3;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="220" y="630" width="95" height="55" as="geometry" />
        </mxCell>
        
        <mxCell id="collaboration" value="Collaboration" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8d7da;strokeColor=#ff9ff3;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="480" y="630" width="95" height="55" as="geometry" />
        </mxCell>
        
        <!-- Branch 4: Resources (Left) -->
        <mxCell id="resources" value="💰 RESOURCES" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#54a0ff;strokeColor=#ffffff;fontFamily=Arial;fontSize=14;fontStyle=1;fontColor=#ffffff;shadow=1;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="100" y="370" width="100" height="60" as="geometry" />
        </mxCell>
        
        <mxCell id="budget" value="Budget" style="ellipse;whiteSpace=wrap;html=1;fillColor=#cce5ff;strokeColor=#54a0ff;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="20" y="300" width="80" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="tools" value="Tools" style="ellipse;whiteSpace=wrap;html=1;fillColor=#cce5ff;strokeColor=#54a0ff;fontFamily=Arial;fontSize=11;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="20" y="420" width="80" height="50" as="geometry" />
        </mxCell>
        
        <!-- Organic Curved Connections -->
        <mxCell id="conn1" value="" edge="1" source="center" target="strategy" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=4;strokeColor=#4ecdc4;endArrow=none;endFill=0;startArrow=none;startFill=0;">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="380" y="280" />
            </Array>
          </mxGeometry>
        </mxCell>
        
        <mxCell id="conn2" value="" edge="1" source="center" target="execution" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=4;strokeColor=#feca57;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="520" y="390" />
            </Array>
          </mxGeometry>
        </mxCell>
        
        <mxCell id="conn3" value="" edge="1" source="center" target="team" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=4;strokeColor=#ff9ff3;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="400" y="480" />
            </Array>
          </mxGeometry>
        </mxCell>
        
        <mxCell id="conn4" value="" edge="1" source="center" target="resources" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=4;strokeColor=#54a0ff;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="280" y="390" />
            </Array>
          </mxGeometry>
        </mxCell>
        
        <!-- Sub-branch connections -->
        <mxCell id="sub1" value="" edge="1" source="strategy" target="planning" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#4ecdc4;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="sub2" value="" edge="1" source="strategy" target="research" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#4ecdc4;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="sub3" value="" edge="1" source="execution" target="development" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#feca57;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="sub4" value="" edge="1" source="execution" target="testing" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#feca57;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="sub5" value="" edge="1" source="team" target="communication" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#ff9ff3;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="sub6" value="" edge="1" source="team" target="collaboration" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#ff9ff3;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="sub7" value="" edge="1" source="resources" target="budget" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#54a0ff;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="sub8" value="" edge="1" source="resources" target="tools" parent="1" style="edgeStyle=none;curved=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#54a0ff;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const modernOrganizationChart = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Chantilly" modified="2025-10-06T00:00:00.000Z" agent="Chantilly Agent" version="21.6.5" type="device">
  <diagram name="Modern Organization Chart" id="org-chart">
    <mxGraphModel dx="1422" dy="794" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" background="#f7f9fc" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- CEO Level -->
        <mxCell id="ceo" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;👑 Chief Executive Officer&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 11px;&quot;&gt;Sarah Johnson&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;CEO@company.com&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#667aff;strokeColor=#ffffff;fontFamily=Segoe UI;fontSize=12;fontColor=#ffffff;shadow=1;strokeWidth=2;gradientColor=#4d61ff;" vertex="1" parent="1">
          <mxGeometry x="300" y="50" width="200" height="90" as="geometry" />
        </mxCell>
        
        <!-- C-Level -->
        <mxCell id="cto" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;🔧 Chief Technology Officer&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 11px;&quot;&gt;Michael Chen&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;Engineering &amp;amp; Innovation&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ff6b9d;strokeColor=#ffffff;fontFamily=Segoe UI;fontSize=11;fontColor=#ffffff;shadow=1;strokeWidth=2;gradientColor=#ff4081;" vertex="1" parent="1">
          <mxGeometry x="50" y="200" width="180" height="80" as="geometry" />
        </mxCell>
        
        <mxCell id="cmo" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;📈 Chief Marketing Officer&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 11px;&quot;&gt;Emily Rodriguez&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;Brand &amp;amp; Growth&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#4ecdc4;strokeColor=#ffffff;fontFamily=Segoe UI;fontSize=11;fontColor=#ffffff;shadow=1;strokeWidth=2;gradientColor=#26a9a0;" vertex="1" parent="1">
          <mxGeometry x="310" y="200" width="180" height="80" as="geometry" />
        </mxCell>
        
        <mxCell id="cfo" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;💰 Chief Financial Officer&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 11px;&quot;&gt;David Park&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;Finance &amp;amp; Operations&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#feca57;strokeColor=#ffffff;fontFamily=Segoe UI;fontSize=11;fontColor=#2c3e50;shadow=1;strokeWidth=2;gradientColor=#f39c12;" vertex="1" parent="1">
          <mxGeometry x="570" y="200" width="180" height="80" as="geometry" />
        </mxCell>
        
        <!-- Department Level -->
        <mxCell id="dev_team" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;💻 Development Team&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 10px;&quot;&gt;Frontend • Backend • DevOps&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;12 Engineers&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fab1a0;strokeColor=#e17055;fontFamily=Segoe UI;fontSize=10;fontColor=#2d3436;shadow=1;strokeWidth=1;" vertex="1" parent="1">
          <mxGeometry x="20" y="350" width="140" height="70" as="geometry" />
        </mxCell>
        
        <mxCell id="qa_team" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;🧪 QA Team&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 10px;&quot;&gt;Testing • Automation&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;6 Specialists&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fab1a0;strokeColor=#e17055;fontFamily=Segoe UI;fontSize=10;fontColor=#2d3436;shadow=1;strokeWidth=1;" vertex="1" parent="1">
          <mxGeometry x="180" y="350" width="140" height="70" as="geometry" />
        </mxCell>
        
        <mxCell id="design_team" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;🎨 Design Team&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 10px;&quot;&gt;UX • UI • Graphics&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;8 Designers&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#81ecec;strokeColor=#00b894;fontFamily=Segoe UI;fontSize=10;fontColor=#2d3436;shadow=1;strokeWidth=1;" vertex="1" parent="1">
          <mxGeometry x="330" y="350" width="140" height="70" as="geometry" />
        </mxCell>
        
        <mxCell id="marketing_team" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;📊 Marketing Team&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 10px;&quot;&gt;Digital • Content • Analytics&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;10 Marketers&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#81ecec;strokeColor=#00b894;fontFamily=Segoe UI;fontSize=10;fontColor=#2d3436;shadow=1;strokeWidth=1;" vertex="1" parent="1">
          <mxGeometry x="490" y="350" width="140" height="70" as="geometry" />
        </mxCell>
        
        <mxCell id="finance_team" value="&lt;div style=&quot;text-align: center;&quot;&gt;&lt;b&gt;📋 Finance Team&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font style=&quot;font-size: 10px;&quot;&gt;Accounting • Planning&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size: 9px; color: #666;&quot;&gt;5 Analysts&lt;/font&gt;&lt;/div&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fdcb6e;strokeColor=#e84393;fontFamily=Segoe UI;fontSize=10;fontColor=#2d3436;shadow=1;strokeWidth=1;" vertex="1" parent="1">
          <mxGeometry x="650" y="350" width="140" height="70" as="geometry" />
        </mxCell>
        
        <!-- Modern Connecting Lines -->
        <mxCell id="line1" value="" edge="1" source="ceo" target="cto" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=3;strokeColor=#667aff;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="line2" value="" edge="1" source="ceo" target="cmo" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=3;strokeColor=#667aff;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="line3" value="" edge="1" source="ceo" target="cfo" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=3;strokeColor=#667aff;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="line4" value="" edge="1" source="cto" target="dev_team" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#ff6b9d;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="line5" value="" edge="1" source="cto" target="qa_team" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#ff6b9d;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="line6" value="" edge="1" source="cmo" target="design_team" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#4ecdc4;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="line7" value="" edge="1" source="cmo" target="marketing_team" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#4ecdc4;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="line8" value="" edge="1" source="cfo" target="finance_team" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#feca57;endArrow=none;endFill=0;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

module.exports = {
  professionalFlowchart,
  creativeMindmap,
  modernOrganizationChart,
  
  // Knowledge base entries to add
  knowledgeBaseEntries: [
    {
      title: 'Professional Flowchart Template - Modern Business Process',
      content: professionalFlowchart,
      category: 'processes', 
      tags: ['drawio', 'flowchart', 'business-process', 'professional', 'gradient', 'modern'],
      metadata: {
        diagramType: 'flowchart',
        complexity: 'medium',
        style: 'professional-gradient',
        colorScheme: 'multi-color-gradients',
        layout: 'vertical-flow'
      }
    },
    {
      title: 'Creative Mind Map Template - Project Planning',
      content: creativeMindmap,
      category: 'general',
      tags: ['drawio', 'mindmap', 'creative', 'colorful', 'organic', 'project-planning'],
      metadata: {
        diagramType: 'mindmap', 
        complexity: 'medium',
        style: 'creative-organic',
        colorScheme: 'vibrant-multi',
        layout: 'radial-branches'
      }
    },
    {
      title: 'Modern Organization Chart - Corporate Structure',
      content: modernOrganizationChart,
      category: 'hr',
      tags: ['drawio', 'org-chart', 'corporate', 'hierarchy', 'modern', 'professional'],
      metadata: {
        diagramType: 'org-chart',
        complexity: 'medium', 
        style: 'modern-corporate',
        colorScheme: 'professional-gradient',
        layout: 'hierarchical-tree'
      }
    }
  ]
};